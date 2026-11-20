package br.com.mundopet.shared;

import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilter;
import org.springframework.web.server.WebFilterChain;

import reactor.core.publisher.Mono;

/**
 * Protecao contra negacao de servico na camada de aplicacao (segunda barreira, a primeira e o nginx).
 * Janela fixa por IP armazenada no Redis, portanto vale para todas as replicas juntas.
 * Alem do Redis, cada replica conta localmente (em memoria) e barra se QUALQUER um dos dois passar do limite.
 * Se o Redis cair ou ficar lento, a API nao para e o ataque continua barrado pelo contador local
 * (no pior caso, com N replicas, passam N x o limite).
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RateLimitFilter implements WebFilter {

    private static final Logger log = LoggerFactory.getLogger(RateLimitFilter.class);
    private static final Duration REDIS_TIMEOUT = Duration.ofMillis(200);

    /** Acima disso o mapa local e limpo (protege a memoria contra muitos IPs diferentes). */
    static final int LOCAL_MAX_KEYS = 50_000;

    private final ReactiveStringRedisTemplate redis;
    private final RateLimitProperties props;
    private final ConcurrentHashMap<String, AtomicLong> local = new ConcurrentHashMap<>();
    private final AtomicLong localWindow = new AtomicLong(-1);

    public RateLimitFilter(ReactiveStringRedisTemplate redis, RateLimitProperties props) {
        this.redis = redis;
        this.props = props;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, WebFilterChain chain) {
        String path = exchange.getRequest().getPath().value();
        if (!props.enabled() || !path.startsWith("/api/")) {
            return chain.filter(exchange);
        }
        long window = Instant.now().getEpochSecond() / props.windowSeconds();
        String key = "rl:" + clientIp(exchange) + ":" + window;

        long localCount = localIncrement(key, window);
        return redis.opsForValue().increment(key)
                .flatMap(count -> count == 1
                        ? redis.expire(key, Duration.ofSeconds(props.windowSeconds() + 1)).thenReturn(count)
                        : Mono.just(count))
                .timeout(REDIS_TIMEOUT)
                .onErrorResume(ex -> {
                    log.debug("Rate limit no Redis indisponivel, usando so o limite local: {}", ex.toString());
                    return Mono.just(0L);
                })
                .flatMap(count -> {
                    if (count > props.requestsPerWindow() || localCount > props.requestsPerWindow()) {
                        exchange.getResponse().setStatusCode(HttpStatus.TOO_MANY_REQUESTS);
                        exchange.getResponse().getHeaders().set("Retry-After", String.valueOf(props.windowSeconds()));
                        return exchange.getResponse().setComplete();
                    }
                    return chain.filter(exchange);
                });
    }

    /**
     * Contador local da janela. Ao virar a janela, os contadores antigos sao descartados de uma vez (O(1) por requisicao).
     * Muitos IPs diferentes na mesma janela: o mapa e zerado ao chegar no teto (protege a memoria).
     */
    long localIncrement(String key, long window) {
        long seen = localWindow.get();
        if (seen != window && localWindow.compareAndSet(seen, window)) {
            local.clear();
        } else if (local.size() >= LOCAL_MAX_KEYS && !local.containsKey(key)) {
            local.clear();
        }
        return local.computeIfAbsent(key, k -> new AtomicLong()).incrementAndGet();
    }

    int localSize() {
        return local.size();
    }

    /** IP real do cliente (o nginx sobrescreve X-Real-IP). */
    public static String clientIp(ServerWebExchange exchange) {
        String realIp = exchange.getRequest().getHeaders().getFirst("X-Real-IP");
        if (realIp != null && !realIp.isBlank()) {
            return realIp.trim();
        }
        var remote = exchange.getRequest().getRemoteAddress();
        return remote != null && remote.getAddress() != null ? remote.getAddress().getHostAddress() : "unknown";
    }
}
