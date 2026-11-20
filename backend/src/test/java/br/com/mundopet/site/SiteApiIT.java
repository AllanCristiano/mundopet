package br.com.mundopet.site;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.awaitility.Awaitility;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.MediaType;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.reactive.server.WebTestClient;

import com.fasterxml.jackson.databind.ObjectMapper;

import br.com.mundopet.delivery.DeliveryCalculator;
import br.com.mundopet.shared.AdminGuard;
import br.com.mundopet.support.IntegrationTestBase;

/** Integracao da gestao do site com Postgres real (JSONB + controle de versao). */
class SiteApiIT extends IntegrationTestBase {

    static final String TOKEN = "token-de-teste-do-dono-1234567890";

    @DynamicPropertySource
    static void admin(DynamicPropertyRegistry r) {
        r.add("mundopet.admin.token", () -> TOKEN);
        r.add("mundopet.site.cache-ttl", () -> "0s"); // le sempre do banco: os testes apagam a linha entre si
    }

    @Autowired
    DatabaseClient db;

    @Autowired
    ObjectMapper json;

    @Autowired
    DeliveryCalculator delivery;

    /** Nao deixa configuracao salva para os outros testes de integracao. */
    @AfterEach
    void cleanup() {
        db.sql("DELETE FROM site_settings").fetch().rowsUpdated().block();
    }

    @SuppressWarnings("unchecked")
    Map<String, Object> settings() throws IOException {
        try (InputStream in = getClass().getResourceAsStream("/site-settings.json")) {
            return json.readValue(new String(in.readAllBytes(), StandardCharsets.UTF_8), Map.class);
        }
    }

    private WebTestClient.ResponseSpec put(String token, int version, Map<String, Object> settings) {
        var req = web.put().uri("/api/site/admin").contentType(MediaType.APPLICATION_JSON);
        if (token != null) {
            req = req.header(AdminGuard.HEADER, token);
        }
        return req.bodyValue(Map.of("version", version, "settings", settings)).exchange();
    }

    private Map<String, Object> get() {
        return web.get().uri("/api/site").exchange().expectStatus().isOk()
                .expectHeader().cacheControl(org.springframework.http.CacheControl.noCache())
                .expectBody(new ParameterizedTypeReference<Map<String, Object>>() {}).returnResult().getResponseBody();
    }

    @Test
    @SuppressWarnings("unchecked")
    void ownerSavesSettingsSiteReadsThemAndConcurrentEditIsRejected() throws IOException {
        Map<String, Object> first = get();
        assertThat(first.get("version")).isEqualTo(0);
        assertThat(first.get("settings")).isNull();

        // sem token / token errado
        web.get().uri("/api/site/admin/check").exchange().expectStatus().isUnauthorized();
        web.get().uri("/api/site/admin/check").header(AdminGuard.HEADER, TOKEN).exchange().expectStatus().isNoContent();
        put(null, 0, settings()).expectStatus().isUnauthorized();
        put("errado", 0, settings()).expectStatus().isUnauthorized();

        put(TOKEN, 0, settings()).expectStatus().isOk()
                .expectBody().jsonPath("$.version").isEqualTo(1)
                .jsonPath("$.settings.address.state").isEqualTo("SP")
                .jsonPath("$.settings.address.street").isEqualTo("Rua das Flores, 100");

        Awaitility.await().untilAsserted(() -> assertThat(get().get("version")).isEqualTo(1));
        Map<String, Object> saved = (Map<String, Object>) get().get("settings");
        assertThat(((Map<String, Object>) saved.get("store")).get("whatsapp")).isEqualTo("5511999998888");
        assertThat((List<Object>) saved.get("chapters")).hasSize(4);

        // segunda pessoa ainda com a versao 0 (ou 1 depois que a primeira salvou de novo) => 409
        put(TOKEN, 0, settings()).expectStatus().isEqualTo(409)
                .expectBody().jsonPath("$.detail").value(d -> assertThat((String) d).contains("Recarregue"));
        put(TOKEN, 1, settings()).expectStatus().isOk().expectBody().jsonPath("$.version").isEqualTo(2);
        put(TOKEN, 1, settings()).expectStatus().isEqualTo(409);
    }

    @Test
    @SuppressWarnings("unchecked")
    void invalidSettingsAreRejected() throws IOException {
        Map<String, Object> s = settings();
        Map<String, Object> store = new HashMap<>((Map<String, Object>) s.get("store"));
        store.put("instagram", "javascript:alert(1)");
        s.put("store", store);
        put(TOKEN, 0, s).expectStatus().isBadRequest()
                .expectBody().jsonPath("$.errors").value(e -> assertThat(e.toString()).contains("instagram"));

        Map<String, Object> noChapters = settings();
        noChapters.put("chapters", List.of());
        put(TOKEN, 0, noChapters).expectStatus().isBadRequest();
        assertThat(get().get("version")).isEqualTo(0);
    }

    @Test
    void deliveryUsesOwnerRates() throws IOException {
        // antes de salvar: valores do ambiente (R$ 2,00/km)
        assertThat(delivery.quote("01001000").block().pricePerKm()).isEqualByComparingTo("2.00");
        put(TOKEN, 0, settings()).expectStatus().isOk();
        Awaitility.await().untilAsserted(() -> {
            var q = delivery.quote("01001000").block();
            assertThat(q.pricePerKm()).isEqualByComparingTo("3.50");
            assertThat(q.maxKm()).isEqualByComparingTo("10");
        });
    }
}
