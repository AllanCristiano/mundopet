package br.com.mundopet.delivery.internal;

import java.time.Duration;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.stereotype.Component;

import reactor.core.publisher.Mono;

/** Coordenadas por CEP no Redis (compartilhado entre as replicas). Falha aberta: sem Redis, consulta as APIs. */
@Component
class GeoCache {

    private static final Logger log = LoggerFactory.getLogger(GeoCache.class);
    private static final Duration REDIS_TIMEOUT = Duration.ofMillis(300);

    private final ReactiveStringRedisTemplate redis;
    private final DeliveryProperties props;

    GeoCache(ReactiveStringRedisTemplate redis, DeliveryProperties props) {
        this.redis = redis;
        this.props = props;
    }

    Mono<GeoPoint> get(String cep) {
        return redis.opsForValue().get(key(cep))
                .timeout(REDIS_TIMEOUT)
                .map(GeoPoint::decode)
                .onErrorResume(ex -> {
                    log.warn("Cache de coordenadas indisponivel: {}", ex.toString());
                    return Mono.empty();
                });
    }

    Mono<GeoPoint> put(String cep, GeoPoint point) {
        return redis.opsForValue().set(key(cep), point.encode(), props.cacheTtl())
                .timeout(REDIS_TIMEOUT)
                .onErrorResume(ex -> Mono.just(false))
                .thenReturn(point);
    }

    static String key(String cep) {
        return "geo:" + cep;
    }
}
