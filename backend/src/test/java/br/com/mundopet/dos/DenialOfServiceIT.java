package br.com.mundopet.dos;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.web.reactive.function.client.WebClient;

import br.com.mundopet.support.IntegrationTestBase;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/**
 * Teste contra negacao de servico (camada da aplicacao).
 * Regras verificadas:
 *  1. Rajada de um mesmo IP e barrada com 429 (nunca 5xx).
 *  2. Durante o ataque, outro cliente legitimo continua sendo atendido.
 *  3. A aplicacao continua saudavel (health UP e responde rapido) depois do ataque.
 *  4. Payload gigante e recusado sem estourar memoria.
 * O teste de carga contra a stack completa (nginx + 6 replicas) fica em tests/dos (k6).
 */
@TestPropertySource(properties = {
        "mundopet.rate-limit.requests-per-window=20",
        "mundopet.rate-limit.window-seconds=1"
})
class DenialOfServiceIT extends IntegrationTestBase {

    @LocalServerPort
    int port;

    @Test
    void burstFromSingleIpIsThrottledWithoutServerErrors() {
        WebClient client = WebClient.builder().baseUrl("http://localhost:" + port).build();
        Map<Integer, AtomicInteger> statuses = new ConcurrentHashMap<>();
        long start = System.nanoTime();

        Flux.range(0, 500)
                .flatMap(i -> client.get().uri("/api/pets?size=1").header("X-Real-IP", "6.6.6.6")
                        .exchangeToMono(r -> r.releaseBody().thenReturn(r.statusCode().value()))
                        .onErrorReturn(-1), 100)
                .doOnNext(s -> statuses.computeIfAbsent(s, k -> new AtomicInteger()).incrementAndGet())
                .blockLast(Duration.ofSeconds(60));

        // Em cada janela de 1s no maximo 20 passam; o resto TEM que ser 429
        long windows = Duration.ofNanos(System.nanoTime() - start).toSeconds() + 2;
        int ok = statuses.getOrDefault(200, new AtomicInteger()).get();
        assertThat(ok).as("requisicoes aceitas").isLessThanOrEqualTo((int) (20 * windows));
        assertThat(statuses.getOrDefault(429, new AtomicInteger()).get()).as("requisicoes barradas").isPositive();
        assertThat(statuses.keySet()).as("nenhum erro de servidor ou conexao").allMatch(s -> s == 200 || s == 429);

        // Cliente legitimo (outro IP) continua sendo atendido
        web.get().uri("/api/pets?size=1").header("X-Real-IP", "1.2.3.4").exchange().expectStatus().isOk();
    }

    @Test
    void applicationStaysHealthyAfterAttack() {
        WebClient client = WebClient.builder().baseUrl("http://localhost:" + port).build();
        Flux.range(0, 300)
                .flatMap(i -> client.post().uri("/api/jobs").header("X-Real-IP", "7.7.7.7")
                        .contentType(MediaType.APPLICATION_JSON).bodyValue(Map.of("type", "pet.created", "payload", "x"))
                        .exchangeToMono(r -> r.releaseBody().thenReturn(r.statusCode().value()))
                        .onErrorReturn(-1), 100)
                .blockLast(Duration.ofSeconds(60));

        long start = System.nanoTime();
        web.get().uri("/actuator/health").exchange().expectStatus().isOk()
                .expectBody().jsonPath("$.status").isEqualTo("UP");
        assertThat(Duration.ofNanos(System.nanoTime() - start)).isLessThan(Duration.ofSeconds(2));
    }

    @Test
    void hugePayloadIsRejected() {
        String huge = "x".repeat(3 * 1024 * 1024); // 3MB > limite de 1MB do codec
        WebClient client = WebClient.builder().baseUrl("http://localhost:" + port).build();

        Integer status = client.post().uri("/api/pets").header("X-Real-IP", "8.8.8.8")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"name\":\"" + huge + "\",\"species\":\"gato\"}")
                .exchangeToMono(r -> r.releaseBody().thenReturn(r.statusCode().value()))
                .onErrorResume(e -> Mono.just(-1))
                .block(Duration.ofSeconds(30));

        assertThat(status).isIn(HttpStatus.BAD_REQUEST.value(), HttpStatus.PAYLOAD_TOO_LARGE.value(), -1);
    }
}
