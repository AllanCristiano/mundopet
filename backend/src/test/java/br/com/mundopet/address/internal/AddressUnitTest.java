package br.com.mundopet.address.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.data.redis.core.ReactiveValueOperations;
import org.springframework.web.reactive.function.client.WebClient;

import com.fasterxml.jackson.databind.ObjectMapper;

import br.com.mundopet.address.Address;
import br.com.mundopet.shared.DependencyUnavailableException;
import br.com.mundopet.shared.NotFoundException;
import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

/** Unitarios + falha do modulo de enderecos. */
class AddressUnitTest {

    static final Address SE = new Address("01001-000", "Praça da Sé", "Sé", "São Paulo", "SP", "ViaCEP");

    // ---------------- Address ----------------

    @Test
    void normalizesAndFormatsCep() {
        assertThat(Address.normalizeCep("01001-000")).isEqualTo("01001000");
        assertThat(Address.normalizeCep(" 01.001 000 ")).isEqualTo("01001000");
        assertThat(Address.normalizeCep("1234")).isNull();
        assertThat(Address.normalizeCep("123456789")).isNull();
        assertThat(Address.normalizeCep(null)).isNull();
        assertThat(Address.formatCep("01001000")).isEqualTo("01001-000");
    }

    // ---------------- Servico: ordem das fontes, cache e falhas ----------------

    static CepProvider provider(String name, Mono<Address> result, AtomicInteger calls) {
        return new CepProvider() {
            public String name() { return name; }
            public Mono<Address> find(String cep) { return Mono.defer(() -> { calls.incrementAndGet(); return result; }); }
        };
    }

    private final CepCache cache = mock(CepCache.class);

    @BeforeEach
    void cacheMiss() {
        when(cache.get(anyString())).thenReturn(Mono.empty());
        when(cache.put(any(), anyString())).thenAnswer(inv -> Mono.just(inv.getArgument(0)));
    }

    @Test
    void invalidCepIsRejectedWithoutCallingProviders() {
        AtomicInteger calls = new AtomicInteger();
        var service = new CepLookupService(cache, List.of(provider("A", Mono.just(SE), calls)));
        StepVerifier.create(service.lookup("123")).expectError(IllegalArgumentException.class).verify();
        assertThat(calls).hasValue(0);
    }

    @Test
    void cacheHitSkipsProviders() {
        AtomicInteger calls = new AtomicInteger();
        when(cache.get("01001000")).thenReturn(Mono.just(SE));
        var service = new CepLookupService(cache, List.of(provider("A", Mono.just(SE), calls)));
        StepVerifier.create(service.lookup("01001-000")).expectNext(SE).verifyComplete();
        assertThat(calls).hasValue(0);
    }

    @Test
    void firstProviderAnswersAndResultIsCached() {
        AtomicInteger a = new AtomicInteger();
        AtomicInteger b = new AtomicInteger();
        var service = new CepLookupService(cache, List.of(provider("A", Mono.just(SE), a), provider("B", Mono.just(SE), b)));
        StepVerifier.create(service.lookup("01001000")).expectNext(SE).verifyComplete();
        assertThat(a).hasValue(1);
        assertThat(b).hasValue(0);
        verify(cache).put(SE, "01001000");
    }

    @Test
    void fallsBackWhenFirstProviderIsDown() {
        AtomicInteger b = new AtomicInteger();
        var service = new CepLookupService(cache, List.of(
                provider("A", Mono.error(new IllegalStateException("timeout")), new AtomicInteger()),
                provider("B", Mono.just(SE), b)));
        StepVerifier.create(service.lookup("01001000")).expectNext(SE).verifyComplete();
        assertThat(b).hasValue(1);
    }

    @Test
    void fallsBackWhenFirstProviderDoesNotKnowTheCep() {
        var service = new CepLookupService(cache, List.of(
                provider("A", Mono.empty(), new AtomicInteger()), provider("B", Mono.just(SE), new AtomicInteger())));
        StepVerifier.create(service.lookup("01001000")).expectNext(SE).verifyComplete();
    }

    @Test
    void notFoundWhenProvidersAnswerButDoNotKnowTheCep() {
        var service = new CepLookupService(cache, List.of(
                provider("A", Mono.empty(), new AtomicInteger()),
                provider("B", Mono.error(new IllegalStateException("down")), new AtomicInteger())));
        StepVerifier.create(service.lookup("99999999")).expectError(NotFoundException.class).verify();
        verify(cache, never()).put(any(), anyString());
    }

    @Test
    void unavailableWhenAllProvidersFail() {
        var service = new CepLookupService(cache, List.of(
                provider("A", Mono.error(new IllegalStateException("down")), new AtomicInteger()),
                provider("B", Mono.error(new IllegalStateException("down")), new AtomicInteger())));
        StepVerifier.create(service.lookup("01001000")).expectError(DependencyUnavailableException.class).verify();
    }

    // ---------------- Cache: falha aberta ----------------

    @Test
    @SuppressWarnings("unchecked")
    void cacheFailsOpenWhenRedisIsDown() {
        ReactiveStringRedisTemplate redis = mock(ReactiveStringRedisTemplate.class);
        ReactiveValueOperations<String, String> ops = mock(ReactiveValueOperations.class);
        when(redis.opsForValue()).thenReturn(ops);
        when(ops.get(anyString())).thenReturn(Mono.error(new RedisConnectionFailureException("down")));
        when(ops.set(anyString(), anyString(), any(Duration.class))).thenReturn(Mono.error(new RedisConnectionFailureException("down")));
        var c = new CepCache(redis, new ObjectMapper(), new AddressProperties(null, null, null, null));

        StepVerifier.create(c.get("01001000")).verifyComplete();
        StepVerifier.create(c.put(SE, "01001000")).expectNext(SE).verifyComplete();
        assertThat(CepCache.key("01001000")).isEqualTo("cep:01001000");
    }

    // ---------------- Fontes HTTP (servidor falso) ----------------

    private MockWebServer server;

    @AfterEach
    void stop() throws IOException {
        if (server != null) {
            server.shutdown();
        }
    }

    private CepProvider http(String which, Duration timeout) throws IOException {
        server = new MockWebServer();
        server.start();
        String base = server.url("/").toString().replaceAll("/$", "");
        var props = new AddressProperties(base, base, timeout, null);
        var cfg = new CepProviders();
        return which.equals("via") ? cfg.viaCep(WebClient.builder(), props) : cfg.brasilApi(WebClient.builder(), props);
    }

    private static MockResponse json(int status, String body) {
        return new MockResponse().setResponseCode(status).setHeader("Content-Type", "application/json").setBody(body);
    }

    @Test
    void viaCepMapsResponseAndSendsGenericUserAgent() throws Exception {
        CepProvider via = http("via", Duration.ofSeconds(2));
        server.enqueue(json(200, """
                {"cep":"01001-000","logradouro":"Praça da Sé","bairro":"Sé","localidade":"São Paulo","uf":"SP"}"""));
        StepVerifier.create(via.find("01001000"))
                .expectNext(new Address("01001-000", "Praça da Sé", "Sé", "São Paulo", "SP", "ViaCEP"))
                .verifyComplete();
        var req = server.takeRequest(1, TimeUnit.SECONDS);
        assertThat(req.getPath()).isEqualTo("/01001000/json/");
        assertThat(req.getHeader("User-Agent")).isEqualTo(CepProviders.USER_AGENT);
    }

    @Test
    void viaCepErroMeansNotFound() throws Exception {
        CepProvider via = http("via", Duration.ofSeconds(2));
        server.enqueue(json(200, "{\"erro\": \"true\"}"));
        StepVerifier.create(via.find("99999999")).verifyComplete();
        server.enqueue(json(400, "{}"));
        StepVerifier.create(via.find("00000000")).verifyComplete();
    }

    @Test
    void brasilApiMapsResponseAnd404IsNotFound() throws Exception {
        CepProvider api = http("brasil", Duration.ofSeconds(2));
        server.enqueue(json(200, """
                {"cep":"01001000","state":"SP","city":"São Paulo","neighborhood":"Sé","street":"Praça da Sé","service":"x"}"""));
        server.enqueue(json(404, "{\"message\":\"not found\"}"));
        StepVerifier.create(api.find("01001000")).assertNext(a -> {
            assertThat(a.street()).isEqualTo("Praça da Sé");
            assertThat(a.source()).isEqualTo("BrasilAPI");
        }).verifyComplete();
        StepVerifier.create(api.find("99999999")).verifyComplete();
        assertThat(server.takeRequest().getPath()).isEqualTo("/01001000");
    }

    @Test
    void serverErrorOrSlowProviderIsAnError() throws Exception {
        CepProvider via = http("via", Duration.ofMillis(300));
        server.enqueue(json(500, "{}"));
        StepVerifier.create(via.find("01001000")).expectError().verify();
        server.enqueue(json(200, "{}").setBodyDelay(2, TimeUnit.SECONDS));
        StepVerifier.create(via.find("01001000")).expectError(java.util.concurrent.TimeoutException.class).verify();
    }

    @Test
    void missingFieldsBecomeEmptyStrings() {
        Address a = CepProviders.HttpCepProvider.fromViaCep(Map.of("uf", "SP"), "01001000", "ViaCEP");
        assertThat(a.street()).isEmpty();
        assertThat(a.state()).isEqualTo("SP");
    }
}
