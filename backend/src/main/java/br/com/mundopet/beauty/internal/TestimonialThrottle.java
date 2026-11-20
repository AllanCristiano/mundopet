package br.com.mundopet.beauty.internal;

import java.time.Duration;
import java.time.Instant;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.stereotype.Component;

import reactor.core.publisher.Mono;

/**
 * Anti-spam dos depoimentos: no maximo {@value #MAX_PER_HOUR} envios por IP por hora (contador no Redis,
 * vale para todas as replicas). Falha aberta: sem Redis, aceita (a moderacao ainda filtra).
 */
@Component
class TestimonialThrottle {

    static final int MAX_PER_HOUR = 3;
    private static final Logger log = LoggerFactory.getLogger(TestimonialThrottle.class);
    private static final Duration REDIS_TIMEOUT = Duration.ofMillis(300);

    private final ReactiveStringRedisTemplate redis;

    TestimonialThrottle(ReactiveStringRedisTemplate redis) {
        this.redis = redis;
    }

    Mono<Boolean> allow(String ip) {
        String key = "beauty:tm:" + ip + ":" + Instant.now().getEpochSecond() / 3600;
        return redis.opsForValue().increment(key)
                .flatMap(n -> n == 1 ? redis.expire(key, Duration.ofHours(1)).thenReturn(n) : Mono.just(n))
                .timeout(REDIS_TIMEOUT)
                .map(n -> n <= MAX_PER_HOUR)
                .onErrorResume(ex -> {
                    log.warn("Limite de depoimentos indisponivel (fail-open): {}", ex.toString());
                    return Mono.just(true);
                });
    }
}
