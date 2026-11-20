package br.com.mundopet.queue;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import java.time.Duration;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;

import br.com.mundopet.support.IntegrationTestBase;
import reactor.core.publisher.Mono;

/** Integracao da fila com Redis real: sucesso, retentativa, dead letter e validacao via HTTP. */
@Import(QueueIT.TestHandlers.class)
// Stream propria: outros contextos de teste (sem estes handlers) compartilham o mesmo Redis
@TestPropertySource(properties = {
        "mundopet.queue.stream=jobs-queue-it",
        "mundopet.queue.dead-letter-stream=jobs-queue-it:dlq"
})
class QueueIT extends IntegrationTestBase {

    @TestConfiguration
    static class TestHandlers {
        @Bean
        JobHandler alwaysFails() {
            return new JobHandler() {
                public String type() { return "test.fail"; }
                public Mono<Void> handle(Job job) { return Mono.error(new IllegalStateException("boom")); }
            };
        }

        @Bean
        JobHandler failsOnce() {
            return new JobHandler() {
                public String type() { return "test.flaky"; }
                public Mono<Void> handle(Job job) {
                    return job.attempts() == 0 ? Mono.error(new IllegalStateException("1a falha")) : Mono.empty();
                }
            };
        }
    }

    @Autowired
    JobQueue queue;

    @Autowired
    ReactiveStringRedisTemplate redis;

    @Autowired
    QueueProperties props;

    @Test
    void flakyJobSucceedsAfterRetry() {
        String id = queue.enqueue("test.flaky", "x").block();

        await().atMost(Duration.ofSeconds(15)).untilAsserted(() -> {
            JobStatus s = queue.status(id).block();
            assertThat(s.state()).isEqualTo(JobState.DONE);
            assertThat(s.attempts()).isEqualTo(1);
        });
    }

    @Test
    void failingJobGoesToDeadLetterAfterMaxAttempts() {
        String id = queue.enqueue("test.fail", "x").block();

        await().atMost(Duration.ofSeconds(20)).untilAsserted(() -> {
            JobStatus s = queue.status(id).block();
            assertThat(s.state()).isEqualTo(JobState.FAILED);
            assertThat(s.attempts()).isEqualTo(props.maxAttempts());
            assertThat(s.error()).contains("boom");
        });
        Long dlqSize = redis.opsForStream().size(props.deadLetterStream()).block();
        assertThat(dlqSize).isPositive();
    }

    @Test
    void httpEnqueueAndStatus() {
        String id = web.post().uri("/api/jobs").contentType(MediaType.APPLICATION_JSON)
                .bodyValue(Map.of("type", "test.flaky", "payload", "y"))
                .exchange()
                .expectStatus().isAccepted()
                .expectBody(Map.class).returnResult().getResponseBody().get("id").toString();

        web.get().uri("/api/jobs/{id}", id).exchange().expectStatus().isOk()
                .expectBody().jsonPath("$.type").isEqualTo("test.flaky");
    }

    @Test
    void unknownJobTypeIsRejected() {
        web.post().uri("/api/jobs").contentType(MediaType.APPLICATION_JSON)
                .bodyValue(Map.of("type", "nao.existe"))
                .exchange()
                .expectStatus().isBadRequest();
    }

    @Test
    void unknownJobIdIs404() {
        web.get().uri("/api/jobs/nao-existe").exchange().expectStatus().isNotFound();
    }
}
