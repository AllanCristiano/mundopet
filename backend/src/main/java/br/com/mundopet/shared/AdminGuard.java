package br.com.mundopet.shared;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.Base64;
import java.util.HexFormat;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import reactor.core.publisher.Mono;

/**
 * Login da area administrativa (gestao do site e area da clinica).
 * - Login e senha (ADMIN_USER / ADMIN_PASSWORD) criam uma SESSAO no Redis (vale em todas as replicas, expira).
 * - MODO DEMONSTRACAO (ADMIN_DEMO=true): login e senha em branco tambem entram. Nunca use em producao.
 * - ADMIN_TOKEN (opcional, >= 24 caracteres): token fixo para scripts/automacao.
 * As rotas protegidas mandam o token da sessao no header {@value #HEADER}.
 * Comparacoes em tempo constante; o Redis guarda so o hash do token da sessao.
 */
@Component
public class AdminGuard {

    public static final String HEADER = "X-Admin-Token";
    static final int MIN_TOKEN_LENGTH = 24;
    static final int MIN_PASSWORD_LENGTH = 8;
    static final int MAX_FAILURES = 10;
    static final Duration FAILURE_WINDOW = Duration.ofMinutes(15);
    private static final Duration REDIS_TIMEOUT = Duration.ofSeconds(1);
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Logger log = LoggerFactory.getLogger(AdminGuard.class);

    @ConfigurationProperties("mundopet.admin")
    public record AdminProperties(String token, String username, String password, boolean demo, Duration sessionTtl) {
        public AdminProperties {
            if (username == null || username.isBlank()) username = "admin";
            if (sessionTtl == null) sessionTtl = Duration.ofHours(8);
        }
    }

    /** Resposta do login. */
    public record Session(String token, String username, boolean demo, long expiresInSeconds) {
    }

    private final ReactiveStringRedisTemplate redis;
    private final AdminProperties props;
    private final byte[] staticToken;
    private final byte[] password;

    public AdminGuard(AdminProperties props, ReactiveStringRedisTemplate redis) {
        this.props = props;
        this.redis = redis;
        String token = props.token() == null ? "" : props.token().strip();
        this.staticToken = token.length() >= MIN_TOKEN_LENGTH ? sha256(token) : null;
        String pass = props.password() == null ? "" : props.password();
        this.password = pass.length() >= MIN_PASSWORD_LENGTH ? sha256(pass) : null;
        if (props.demo()) {
            log.warn("ATENCAO: area administrativa em MODO DEMONSTRACAO (login e senha em branco entram). Nao use em producao.");
        } else if (password == null && staticToken == null) {
            log.warn("Area administrativa desligada: defina ADMIN_PASSWORD (>= {} caracteres) ou ADMIN_DEMO=true", MIN_PASSWORD_LENGTH);
        }
    }

    public boolean enabled() {
        return props.demo() || password != null || staticToken != null;
    }

    public boolean demo() {
        return props.demo();
    }

    /**
     * Confere login e senha e abre uma sessao.
     * Erros: 403 (area desligada), 429 (tentativas demais deste IP), 401 (login ou senha invalidos).
     */
    public Mono<Session> login(String username, String pass, String ip) {
        if (!enabled()) {
            return Mono.error(disabled());
        }
        String user = username == null ? "" : username.strip();
        String pw = pass == null ? "" : pass;
        String failKey = "admin:fail:" + ip;
        return redis.opsForValue().get(failKey).timeout(REDIS_TIMEOUT).defaultIfEmpty("0")
                .flatMap(failures -> {
                    if (Long.parseLong(failures) >= MAX_FAILURES) {
                        return Mono.error(new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                                "Muitas tentativas erradas. Espere alguns minutos e tente de novo."));
                    }
                    boolean demoLogin = props.demo() && user.isEmpty() && pw.isEmpty();
                    boolean realLogin = password != null
                            && MessageDigest.isEqual(sha256(user), sha256(props.username()))
                            && MessageDigest.isEqual(sha256(pw), password);
                    if (!demoLogin && !realLogin) {
                        log.warn("Login administrativo recusado (ip {})", ip);
                        return redis.opsForValue().increment(failKey)
                                .flatMap(n -> n == 1 ? redis.expire(failKey, FAILURE_WINDOW) : Mono.just(true))
                                .timeout(REDIS_TIMEOUT)
                                .onErrorResume(ex -> Mono.just(true))
                                .then(Mono.error(new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Login ou senha inválidos")));
                    }
                    String name = demoLogin ? "demonstração" : props.username();
                    String token = newToken();
                    return redis.opsForValue().set(sessionKey(token), name, props.sessionTtl())
                            .then(redis.delete(failKey))
                            .timeout(REDIS_TIMEOUT)
                            .thenReturn(new Session(token, name, demoLogin, props.sessionTtl().toSeconds()));
                })
                .onErrorMap(ex -> !(ex instanceof ResponseStatusException), ex -> new DependencyUnavailableException("Sessões (Redis)", ex));
    }

    public Mono<Void> logout(String token) {
        if (token == null || token.isBlank()) {
            return Mono.empty();
        }
        return redis.delete(sessionKey(token.strip())).timeout(REDIS_TIMEOUT).onErrorResume(ex -> Mono.just(0L)).then();
    }

    /** Completa vazio se o token (sessao ou token fixo) vale; senao 403 (desligada) ou 401 (sem sessao). */
    public Mono<Void> check(String provided) {
        return Mono.defer(() -> {
            if (!enabled()) {
                return Mono.error(disabled());
            }
            String token = provided == null ? "" : provided.strip();
            if (token.isEmpty()) {
                return Mono.error(unauthorized());
            }
            if (staticToken != null && MessageDigest.isEqual(staticToken, sha256(token))) {
                return Mono.empty();
            }
            return redis.hasKey(sessionKey(token))
                    .timeout(REDIS_TIMEOUT)
                    .onErrorMap(ex -> new DependencyUnavailableException("Sessões (Redis)", ex))
                    .flatMap(exists -> Boolean.TRUE.equals(exists) ? Mono.<Void>empty() : Mono.error(unauthorized()));
        });
    }

    static String sessionKey(String token) {
        return "admin:session:" + HexFormat.of().formatHex(sha256(token));
    }

    static String newToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static ResponseStatusException disabled() {
        return new ResponseStatusException(HttpStatus.FORBIDDEN,
                "Área administrativa desativada: configure ADMIN_PASSWORD (ou ADMIN_DEMO=true para demonstração)");
    }

    private static ResponseStatusException unauthorized() {
        return new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sessão expirada ou inválida. Entre de novo.");
    }

    static byte[] sha256(String value) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
