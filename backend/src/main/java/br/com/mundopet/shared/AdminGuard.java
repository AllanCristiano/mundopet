package br.com.mundopet.shared;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import reactor.core.publisher.Mono;

/**
 * Protege as rotas administrativas (ex.: a clinica enviando fotos) com um token no header {@value #HEADER}.
 * O token vem de ADMIN_TOKEN. Sem token configurado (ou curto demais) a area administrativa fica DESLIGADA.
 * Comparacao em tempo constante (sobre o hash) para nao vazar o token por tempo de resposta.
 */
@Component
public class AdminGuard {

    public static final String HEADER = "X-Admin-Token";
    static final int MIN_LENGTH = 24;

    private static final Logger log = LoggerFactory.getLogger(AdminGuard.class);

    @ConfigurationProperties("mundopet.admin")
    public record AdminProperties(String token) {
    }

    private final byte[] expected;

    public AdminGuard(AdminProperties props) {
        String token = props.token() == null ? "" : props.token().strip();
        if (token.length() < MIN_LENGTH) {
            log.warn("Area administrativa desligada: defina ADMIN_TOKEN com pelo menos {} caracteres", MIN_LENGTH);
            this.expected = null;
        } else {
            this.expected = sha256(token);
        }
    }

    public boolean enabled() {
        return expected != null;
    }

    /** Completa vazio se o token confere; senao erro 403 (desligado) ou 401 (token errado). */
    public Mono<Void> check(String provided) {
        return Mono.defer(() -> {
            if (expected == null) {
                return Mono.error(new ResponseStatusException(HttpStatus.FORBIDDEN,
                        "Área administrativa desativada: configure ADMIN_TOKEN"));
            }
            if (provided == null || !MessageDigest.isEqual(expected, sha256(provided.strip()))) {
                log.warn("Tentativa de acesso administrativo com token invalido");
                return Mono.error(new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Token inválido"));
            }
            return Mono.empty();
        });
    }

    static byte[] sha256(String value) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
