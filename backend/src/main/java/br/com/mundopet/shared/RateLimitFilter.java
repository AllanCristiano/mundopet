package br.com.mundopet.shared;

import java.time.Duration;
import java.time.Instant;

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
 * Se o Redis cair o filtro falha ABERTO (deixa passar) para nao derrubar a API inteira.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RateLimitFilter implements WebFilter {

    private static final Logger log = LoggerFactory.getLogger(RateLimitFilter.class);
    private static final Duration REDIS_TIMEOUT = Duration.ofMillis(200);

    private final ReactiveStringRedisTemplate redis;
    private final RateLimitProperties props;

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

        return redis.opsForValue().increment(key)
                .flatMap(count -> count == 1
                        ? redis.expire(key, Duration.ofSeconds(props.windowSeconds() + 1)).thenReturn(count)
                        : Mono.just(count))
                .timeout(REDIS_TIMEOUT)
                .onErrorResume(ex -> {
                    log.warn("Rate limit indisponivel (fail-open): {}", ex.toString());
                    return Mono.just(0L);
                })
                .flatMap(count -> {
                    if (count > props.requestsPerWindow()) {
                        exchange.getResponse().setStatusCode(HttpStatus.TOO_MANY_REQUESTS);
                        exchange.getResponse().getHeaders().set("Retry-After", String.valueOf(props.windowSeconds()));
                        return exchange.getResponse().setComplete();
                    }
                    return chain.filter(exchange);
                });
    }

    static String clientIp(ServerWebExchange exchange) {
        String realIp = exchange.getRequest().getHeaders().getFirst("X-Real-IP");
        if (realIp != null && !realIp.isBlank()) {
            return realIp.trim();
        }
        var remote = exchange.getRequest().getRemoteAddress();
        return remote != null && remote.getAddress() != null ? remote.getAddress().getHostAddress() : "unknown";
    }
}
