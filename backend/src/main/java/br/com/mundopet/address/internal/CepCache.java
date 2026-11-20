package br.com.mundopet.address.internal;

import java.time.Duration;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.stereotype.Component;

import com.fasterxml.jackson.databind.ObjectMapper;

import br.com.mundopet.address.Address;
import reactor.core.publisher.Mono;

/**
 * Cache de CEP no Redis (compartilhado entre as replicas).
 * Falha aberta: se o Redis cair, a consulta segue direto nas APIs de CEP.
 */
@Component
class CepCache {

    private static final Logger log = LoggerFactory.getLogger(CepCache.class);
    private static final Duration REDIS_TIMEOUT = Duration.ofMillis(300);

    private final ReactiveStringRedisTemplate redis;
    private final ObjectMapper json;
    private final AddressProperties props;

    CepCache(ReactiveStringRedisTemplate redis, ObjectMapper json, AddressProperties props) {
        this.redis = redis;
        this.json = json;
        this.props = props;
    }

    Mono<Address> get(String cep) {
        return redis.opsForValue().get(key(cep))
                .timeout(REDIS_TIMEOUT)
                .flatMap(raw -> Mono.fromCallable(() -> json.readValue(raw, Address.class)))
                .onErrorResume(ex -> {
                    log.warn("Cache de CEP indisponivel: {}", ex.toString());
                    return Mono.empty();
                });
    }

    Mono<Address> put(Address address, String cep) {
        return Mono.fromCallable(() -> json.writeValueAsString(address))
                .flatMap(raw -> redis.opsForValue().set(key(cep), raw, props.cacheTtl()))
                .timeout(REDIS_TIMEOUT)
                .onErrorResume(ex -> Mono.just(false))
                .thenReturn(address);
    }

    static String key(String cep) {
        return "cep:" + cep;
    }
}
