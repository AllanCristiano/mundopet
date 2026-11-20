package br.com.mundopet.address;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import br.com.mundopet.support.IntegrationTestBase;
import okhttp3.mockwebserver.Dispatcher;
import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;
import okhttp3.mockwebserver.RecordedRequest;

/**
 * Integracao: endpoint de CEP + Redis REAL (cache) + APIs de CEP simuladas por um servidor HTTP falso
 * (o teste nao depende da internet nem da disponibilidade da ViaCEP/BrasilAPI).
 */
class AddressApiIT extends IntegrationTestBase {

    static final MockWebServer VIACEP = new MockWebServer();
    static final MockWebServer BRASILAPI = new MockWebServer();

    static MockResponse json(int status, String body) {
        return new MockResponse().setResponseCode(status).setHeader("Content-Type", "application/json").setBody(body);
    }

    static {
        VIACEP.setDispatcher(new Dispatcher() {
            @Override
            public MockResponse dispatch(RecordedRequest r) {
                return switch (r.getPath()) {
                    case "/01001000/json/" -> json(200, """
                            {"cep":"01001-000","logradouro":"Praça da Sé","bairro":"Sé","localidade":"São Paulo","uf":"SP"}""");
                    case "/20040020/json/" -> json(503, "{}"); // ViaCEP fora do ar para este CEP
                    default -> json(200, "{\"erro\": true}");
                };
            }
        });
        BRASILAPI.setDispatcher(new Dispatcher() {
            @Override
            public MockResponse dispatch(RecordedRequest r) {
                return "/20040020".equals(r.getPath())
                        ? json(200, """
                            {"cep":"20040020","state":"RJ","city":"Rio de Janeiro","neighborhood":"Centro","street":"Avenida Rio Branco"}""")
                        : json(404, "{}");
            }
        });
        try {
            VIACEP.start();
            BRASILAPI.start();
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    @DynamicPropertySource
    static void cepApis(DynamicPropertyRegistry r) {
        r.add("mundopet.address.viacep-url", () -> VIACEP.url("/").toString().replaceAll("/$", ""));
        r.add("mundopet.address.brasilapi-url", () -> BRASILAPI.url("/").toString().replaceAll("/$", ""));
    }

    @Autowired
    ReactiveStringRedisTemplate redis;

    @Test
    void findsAddressAndCachesInRedis() {
        redis.delete("cep:01001000").block();
        int before = VIACEP.getRequestCount();

        web.get().uri("/api/address/cep/01001-000").exchange()
                .expectStatus().isOk()
                .expectHeader().cacheControl(org.springframework.http.CacheControl.maxAge(java.time.Duration.ofDays(1)).cachePublic())
                .expectBody()
                .jsonPath("$.cep").isEqualTo("01001-000")
                .jsonPath("$.street").isEqualTo("Praça da Sé")
                .jsonPath("$.city").isEqualTo("São Paulo")
                .jsonPath("$.state").isEqualTo("SP")
                .jsonPath("$.source").isEqualTo("ViaCEP");

        assertThat(redis.hasKey("cep:01001000").block()).isTrue();

        // segunda consulta vem do cache: nao chama a ViaCEP de novo
        web.get().uri("/api/address/cep/01001000").exchange().expectStatus().isOk();
        assertThat(VIACEP.getRequestCount()).isEqualTo(before + 1);
    }

    @Test
    void fallsBackToBrasilApiWhenViaCepIsDown() {
        redis.delete("cep:20040020").block();
        web.get().uri("/api/address/cep/20040-020").exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.street").isEqualTo("Avenida Rio Branco")
                .jsonPath("$.source").isEqualTo("BrasilAPI");
    }

    @Test
    void unknownCepIs404AndInvalidIs400() {
        web.get().uri("/api/address/cep/99999-999").exchange().expectStatus().isNotFound();
        web.get().uri("/api/address/cep/123").exchange().expectStatus().isBadRequest();
        web.get().uri("/api/address/cep/abcdefgh").exchange().expectStatus().isBadRequest();
    }
}
