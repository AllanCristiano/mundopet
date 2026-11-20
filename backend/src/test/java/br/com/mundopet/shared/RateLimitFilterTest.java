package br.com.mundopet.shared;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.concurrent.atomic.AtomicBoolean;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.data.redis.core.ReactiveValueOperations;
import org.springframework.http.HttpStatus;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.web.server.WebFilterChain;

import reactor.core.publisher.Mono;

/** Testes de falha do rate limit: Redis fora do ar nao derruba a API e o ataque continua barrado (limite local). */
class RateLimitFilterTest {

    private ReactiveStringRedisTemplate redis;
    private ReactiveValueOperations<String, String> ops;
    private RateLimitFilter filter;
    private final AtomicBoolean passed = new AtomicBoolean();
    private final WebFilterChain chain = ex -> {
        passed.set(true);
        return Mono.empty();
    };

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        redis = mock(ReactiveStringRedisTemplate.class);
        ops = mock(ReactiveValueOperations.class);
        when(redis.opsForValue()).thenReturn(ops);
        when(redis.expire(anyString(), any())).thenReturn(Mono.just(true));
        filter = new RateLimitFilter(redis, new RateLimitProperties(true, 2, 1));
    }

    private MockServerWebExchange exchange(String path) {
        return MockServerWebExchange.from(MockServerHttpRequest.get(path).header("X-Real-IP", "10.0.0.1"));
    }

    @Test
    void allowsUnderLimit() {
        when(ops.increment(anyString())).thenReturn(Mono.just(1L));
        var ex = exchange("/api/pets");
        filter.filter(ex, chain).block();
        assertThat(passed).isTrue();
    }

    @Test
    void blocksOverLimitWith429() {
        when(ops.increment(anyString())).thenReturn(Mono.just(3L));
        var ex = exchange("/api/pets");
        filter.filter(ex, chain).block();
        assertThat(passed).isFalse();
        assertThat(ex.getResponse().getStatusCode()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
        assertThat(ex.getResponse().getHeaders().getFirst("Retry-After")).isEqualTo("1");
    }

    @Test
    void localCounterBlocksEvenIfRedisCountIsLow() {
        // ex.: Redis respondeu lento para parte da rajada e contou menos do que chegou nesta replica
        when(ops.increment(anyString())).thenReturn(Mono.just(1L));
        for (int i = 0; i < 2; i++) {
            filter.filter(exchange("/api/pets"), chain).block();
        }
        passed.set(false);
        var ex = exchange("/api/pets");
        filter.filter(ex, chain).block();
        assertThat(passed).isFalse();
        assertThat(ex.getResponse().getStatusCode()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
    }

    @Test
    void failsOpenWhenRedisIsDown() {
        when(ops.increment(anyString())).thenReturn(Mono.error(new RedisConnectionFailureException("down")));
        filter.filter(exchange("/api/pets"), chain).block();
        assertThat(passed).isTrue();
    }

    @Test
    void failsOpenWhenRedisHangs() {
        when(ops.increment(anyString())).thenReturn(Mono.never());
        filter.filter(exchange("/api/pets"), chain).block();
        assertThat(passed).isTrue();
    }

    @Test
    void redisDownStillBlocksAttackWithLocalLimit() {
        when(ops.increment(anyString())).thenReturn(Mono.error(new RedisConnectionFailureException("down")));
        int ok = 0;
        int blocked = 0;
        for (int i = 0; i < 10; i++) {
            passed.set(false);
            var ex = exchange("/api/pets");
            filter.filter(ex, chain).block();
            if (passed.get()) ok++;
            if (ex.getResponse().getStatusCode() == HttpStatus.TOO_MANY_REQUESTS) blocked++;
        }
        // limite 2 por janela de 1s (pode virar a janela no meio do laco: no maximo 4)
        assertThat(ok).isBetween(2, 4);
        assertThat(blocked).isEqualTo(10 - ok);
    }

    @Test
    void localCountersForgetOldWindowsAndAreBounded() {
        filter.localIncrement("rl:a:1", 1);
        filter.localIncrement("rl:b:1", 1);
        assertThat(filter.localIncrement("rl:a:1", 1)).isEqualTo(2);
        filter.localIncrement("rl:a:2", 2); // nova janela: descarta as antigas
        assertThat(filter.localSize()).isEqualTo(1);
        for (int i = 0; i <= RateLimitFilter.LOCAL_MAX_KEYS; i++) {
            filter.localIncrement("rl:ip" + i + ":2", 2);
        }
        assertThat(filter.localSize()).isLessThanOrEqualTo(RateLimitFilter.LOCAL_MAX_KEYS);
        assertThat(filter.localIncrement("rl:x:2", 2)).isEqualTo(1);
    }

    @Test
    void ignoresNonApiPaths() {
        filter.filter(exchange("/actuator/health"), chain).block();
        assertThat(passed).isTrue();
    }

    @Test
    void usesRemoteAddressWithoutProxyHeader() {
        var ex = MockServerWebExchange.from(MockServerHttpRequest.get("/api/x")
                .remoteAddress(new java.net.InetSocketAddress("192.168.0.9", 1234)));
        assertThat(RateLimitFilter.clientIp(ex)).isEqualTo("192.168.0.9");
    }
}
