package br.com.mundopet.queue.internal;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.stream.Stream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.core.ReactiveHashOperations;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;

import br.com.mundopet.queue.Job;
import br.com.mundopet.queue.JobHandler;
import br.com.mundopet.queue.QueueProperties;
import br.com.mundopet.shared.DependencyUnavailableException;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

/** Testes de falha da fila: Redis fora do ar e tipos invalidos. */
class RedisJobQueueTest {

    private ReactiveStringRedisTemplate redis;
    private ReactiveHashOperations<String, Object, Object> hash;
    private RedisJobQueue queue;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        redis = mock(ReactiveStringRedisTemplate.class);
        hash = mock(ReactiveHashOperations.class);
        when(redis.opsForHash()).thenReturn(hash);

        JobHandler handler = new JobHandler() {
            public String type() { return "ok"; }
            public Mono<Void> handle(Job job) { return Mono.empty(); }
        };
        ObjectProvider<JobHandler> provider = mock(ObjectProvider.class);
        when(provider.stream()).thenAnswer(inv -> Stream.of(handler));

        queue = new RedisJobQueue(redis, new QueueProperties(null, null, null, 0, 0, null, null, true), provider);
    }

    @Test
    void unknownTypeIsRejected() {
        StepVerifier.create(queue.enqueue("nope", "x")).expectError(IllegalArgumentException.class).verify();
    }

    @Test
    void enqueueWhenRedisIsDownIsDependencyUnavailable() {
        when(hash.putAll(anyString(), org.mockito.ArgumentMatchers.anyMap()))
                .thenReturn(Mono.error(new RedisConnectionFailureException("down")));

        StepVerifier.create(queue.enqueue("ok", "x")).expectError(DependencyUnavailableException.class).verify();
    }

    @Test
    void statusWhenRedisIsDownIsDependencyUnavailable() {
        when(hash.entries(anyString())).thenReturn(Flux.error(new RedisConnectionFailureException("down")));

        StepVerifier.create(queue.status("1")).expectError(DependencyUnavailableException.class).verify();
    }

    @Test
    void statusOfMissingJobIsEmpty() {
        when(hash.entries(anyString())).thenReturn(Flux.empty());
        StepVerifier.create(queue.status("1")).verifyComplete();
    }

    @Test
    void detectsBusyGroupInCauseChain() {
        var ex = new RuntimeException("wrap", new RuntimeException("BUSYGROUP Consumer Group name already exists"));
        org.assertj.core.api.Assertions.assertThat(JobWorker.isBusyGroup(ex)).isTrue();
        org.assertj.core.api.Assertions.assertThat(JobWorker.isBusyGroup(new RuntimeException("x"))).isFalse();
    }
}
