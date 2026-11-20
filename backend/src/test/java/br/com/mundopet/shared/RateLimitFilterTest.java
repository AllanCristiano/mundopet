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

/** Testes de falha do rate limit: Redis fora do ar nao pode derrubar a API (fail-open). */
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
