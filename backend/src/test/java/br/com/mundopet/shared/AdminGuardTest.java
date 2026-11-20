package br.com.mundopet.shared;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Duration;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.data.redis.core.ReactiveValueOperations;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

/** Login da area administrativa: senha, modo demonstracao, token fixo, sessoes e tentativas erradas. */
class AdminGuardTest {

    static final String TOKEN = "a".repeat(AdminGuard.MIN_TOKEN_LENGTH);

    private ReactiveStringRedisTemplate redis;
    private ReactiveValueOperations<String, String> ops;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        redis = mock(ReactiveStringRedisTemplate.class);
        ops = mock(ReactiveValueOperations.class);
        when(redis.opsForValue()).thenReturn(ops);
        when(ops.get(anyString())).thenReturn(Mono.empty());
        when(ops.set(anyString(), anyString(), any(Duration.class))).thenReturn(Mono.just(true));
        when(ops.increment(anyString())).thenReturn(Mono.just(1L));
        when(redis.expire(anyString(), any(Duration.class))).thenReturn(Mono.just(true));
        when(redis.delete(anyString())).thenReturn(Mono.just(1L));
        when(redis.hasKey(anyString())).thenReturn(Mono.just(false));
    }

    AdminGuard guard(String token, String password, boolean demo) {
        return new AdminGuard(new AdminGuard.AdminProperties(token, "dono", password, demo, null), redis);
    }

    static void expectStatus(Mono<?> mono, HttpStatus status) {
        StepVerifier.create(mono)
                .expectErrorSatisfies(e -> assertThat(((ResponseStatusException) e).getStatusCode()).isEqualTo(status))
                .verify();
    }

    @Test
    void withoutPasswordDemoOrTokenTheAreaIsOff() {
        AdminGuard g = guard("curto", "1234567", false); // senha curta demais tambem nao conta
        assertThat(g.enabled()).isFalse();
        expectStatus(g.check("qualquer"), HttpStatus.FORBIDDEN);
        expectStatus(g.login("dono", "1234567", "1.1.1.1"), HttpStatus.FORBIDDEN);
        assertThat(new AdminGuard.AdminProperties(null, " ", null, false, null).username()).isEqualTo("admin");
    }

    @Test
    void demoModeLetsBlankLoginInButNotWrongPassword() {
        AdminGuard g = guard(null, "senha-forte-123", true);
        assertThat(g.demo()).isTrue();
        StepVerifier.create(g.login("", "", "1.1.1.1")).assertNext(s -> {
            assertThat(s.demo()).isTrue();
            assertThat(s.username()).isEqualTo("demonstração");
            assertThat(s.token()).hasSizeGreaterThan(40);
            assertThat(s.expiresInSeconds()).isEqualTo(Duration.ofHours(8).toSeconds());
        }).verifyComplete();
        StepVerifier.create(g.login(null, null, "1.1.1.1")).expectNextCount(1).verifyComplete();
        // em branco so o login (com senha errada) nao entra
        expectStatus(g.login("dono", "errada", "1.1.1.1"), HttpStatus.UNAUTHORIZED);
        expectStatus(g.login("", "x", "1.1.1.1"), HttpStatus.UNAUTHORIZED);
        // a senha de verdade continua valendo
        StepVerifier.create(g.login(" dono ", "senha-forte-123", "1.1.1.1"))
                .assertNext(s -> assertThat(s.demo()).isFalse()).verifyComplete();
    }

    @Test
    void withoutDemoBlankLoginIsRejectedAndWrongAttemptsAreCounted() {
        AdminGuard g = guard(null, "senha-forte-123", false);
        when(ops.increment("admin:fail:2.2.2.2")).thenReturn(Mono.just(1L), Mono.just(2L));
        expectStatus(g.login("", "", "2.2.2.2"), HttpStatus.UNAUTHORIZED);
        expectStatus(g.login("outro", "senha-forte-123", "2.2.2.2"), HttpStatus.UNAUTHORIZED);
        verify(ops, org.mockito.Mockito.times(2)).increment("admin:fail:2.2.2.2");
        verify(redis).expire(eq("admin:fail:2.2.2.2"), eq(AdminGuard.FAILURE_WINDOW));

        StepVerifier.create(g.login("dono", "senha-forte-123", "2.2.2.2"))
                .assertNext(s -> assertThat(s.username()).isEqualTo("dono")).verifyComplete();
        verify(redis).delete("admin:fail:2.2.2.2"); // acertou: zera as tentativas
    }

    @Test
    void tooManyFailuresBlocksEvenTheRightPassword() {
        when(ops.get("admin:fail:3.3.3.3")).thenReturn(Mono.just(String.valueOf(AdminGuard.MAX_FAILURES)));
        expectStatus(guard(null, "senha-forte-123", false).login("dono", "senha-forte-123", "3.3.3.3"), HttpStatus.TOO_MANY_REQUESTS);
        verify(ops, never()).set(anyString(), anyString(), any(Duration.class));
    }

    @Test
    void sessionIsCheckedInRedisByHashAndLogoutRemovesIt() {
        AdminGuard g = guard(null, "senha-forte-123", false);
        String token = g.login("dono", "senha-forte-123", "1.1.1.1").block().token();
        String key = AdminGuard.sessionKey(token);
        assertThat(key).startsWith("admin:session:").doesNotContain(token); // so o hash fica no Redis
        verify(ops).set(eq(key), eq("dono"), eq(Duration.ofHours(8)));

        when(redis.hasKey(key)).thenReturn(Mono.just(true));
        StepVerifier.create(g.check(" " + token + " ")).verifyComplete();
        expectStatus(g.check("outro-token"), HttpStatus.UNAUTHORIZED);
        expectStatus(g.check(null), HttpStatus.UNAUTHORIZED);
        expectStatus(g.check(" "), HttpStatus.UNAUTHORIZED);

        StepVerifier.create(g.logout(token)).verifyComplete();
        verify(redis).delete(key);
        StepVerifier.create(g.logout(null)).verifyComplete();
    }

    @Test
    void staticTokenForScriptsSkipsRedis() {
        AdminGuard g = guard(TOKEN, null, false);
        assertThat(g.enabled()).isTrue();
        StepVerifier.create(g.check(TOKEN)).verifyComplete();
        verify(redis, never()).hasKey(anyString());
        expectStatus(g.check(TOKEN + "b"), HttpStatus.UNAUTHORIZED);
    }

    @Test
    void redisDownFailsClosed() {
        AdminGuard g = guard(null, "senha-forte-123", true);
        when(redis.hasKey(anyString())).thenReturn(Mono.error(new RedisConnectionFailureException("down")));
        StepVerifier.create(g.check("token")).expectError(DependencyUnavailableException.class).verify();
        when(ops.get(anyString())).thenReturn(Mono.error(new RedisConnectionFailureException("down")));
        StepVerifier.create(g.login("", "", "1.1.1.1")).expectError(DependencyUnavailableException.class).verify();
        // falha ao contar tentativa errada nao esconde o 401
        when(ops.get(anyString())).thenReturn(Mono.empty());
        when(ops.increment(anyString())).thenReturn(Mono.error(new RedisConnectionFailureException("down")));
        expectStatus(g.login("dono", "errada", "1.1.1.1"), HttpStatus.UNAUTHORIZED);
        when(redis.delete(anyString())).thenReturn(Mono.error(new RedisConnectionFailureException("down")));
        StepVerifier.create(g.logout("x")).verifyComplete();
    }
}
