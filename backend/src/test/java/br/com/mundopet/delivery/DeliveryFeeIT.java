package br.com.mundopet.delivery;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import br.com.mundopet.support.IntegrationTestBase;
import okhttp3.mockwebserver.Dispatcher;
import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;
import okhttp3.mockwebserver.RecordedRequest;

/**
 * Integracao: taxa de entrega no orcamento do carrinho com Postgres + Redis REAIS (cache de coordenadas)
 * e as APIs de coordenadas simuladas (nao depende da internet).
 * Loja na Praca da Se (padrao), R$ 2,00/km, raio 15 km, fator de ruas 1,3.
 */
class DeliveryFeeIT extends IntegrationTestBase {

    static final MockWebServer AWESOME = new MockWebServer();
    static final MockWebServer BRASILAPI = new MockWebServer();

    static MockResponse json(int status, String body) {
        return new MockResponse().setResponseCode(status).setHeader("Content-Type", "application/json").setBody(body);
    }

    static {
        AWESOME.setDispatcher(new Dispatcher() {
            @Override
            public MockResponse dispatch(RecordedRequest r) {
                return switch (r.getPath()) {
                    case "/01310100" -> json(200, "{\"lat\":\"-23.5605\",\"lng\":\"-46.6333\"}"); // ~1,1 km da loja
                    case "/20040020" -> json(200, "{\"lat\":\"-22.9035\",\"lng\":\"-43.2096\"}"); // Rio: fora da area
                    case "/04538133" -> json(503, "{}");                                          // AwesomeAPI fora do ar
                    default -> json(404, "{\"code\":\"not_found\"}");
                };
            }
        });
        BRASILAPI.setDispatcher(new Dispatcher() {
            @Override
            public MockResponse dispatch(RecordedRequest r) {
                return "/04538133".equals(r.getPath())
                        ? json(200, "{\"location\":{\"coordinates\":{\"latitude\":\"-23.5705\",\"longitude\":\"-46.6333\"}}}")
                        : json(404, "{}");
            }
        });
        try {
            AWESOME.start();
            BRASILAPI.start();
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    @DynamicPropertySource
    static void geoApis(DynamicPropertyRegistry r) {
        r.add("mundopet.delivery.awesomeapi-url", () -> AWESOME.url("/").toString().replaceAll("/$", ""));
        r.add("mundopet.delivery.brasilapi-url", () -> BRASILAPI.url("/").toString().replaceAll("/$", ""));
    }

    @Autowired
    ReactiveStringRedisTemplate redis;

    @Autowired
    DeliveryCalculator calculator;

    record Product(String id, boolean inStock, BigDecimal effectivePrice) {
    }

    record Page(List<Product> items) {
    }

    private Map<String, Object> quote(String cep) {
        Product p = web.get().uri("/api/catalog/products?sort=NAME&pageSize=48").exchange().expectStatus().isOk()
                .expectBody(Page.class).returnResult().getResponseBody()
                .items().stream().filter(Product::inStock).findFirst().orElseThrow();
        Map<String, Object> address = new HashMap<>(Map.of("cep", cep, "street", "Rua A", "number", "10", "district", "B",
                "city", "São Paulo", "state", "SP"));
        Map<String, Object> body = Map.of("items", List.of(Map.of("productId", p.id(), "quantity", 1)),
                "fulfillment", "DELIVERY", "address", address);
        Map<String, Object> res = web.post().uri("/api/catalog/cart/quote").contentType(MediaType.APPLICATION_JSON).bodyValue(body)
                .exchange().expectStatus().isOk()
                .expectBody(new ParameterizedTypeReference<Map<String, Object>>() {}).returnResult().getResponseBody();
        res.put("_price", p.effectivePrice());
        return res;
    }

    @Test
    @SuppressWarnings("unchecked")
    void deliveryFeeIsAddedToTotalAndMessageAndCoordinatesAreCached() {
        redis.delete("geo:01310100").block();
        int before = AWESOME.getRequestCount();

        Map<String, Object> res = quote("01310-100");
        Map<String, Object> delivery = (Map<String, Object>) res.get("delivery");
        // 1,112 km x 1,3 = 1,446 -> 1,5 km x R$ 2,00 = R$ 3,00
        assertThat(delivery.get("status")).isEqualTo("OK");
        assertThat(new BigDecimal(delivery.get("distanceKm").toString())).isEqualByComparingTo("1.5");
        assertThat(new BigDecimal(res.get("deliveryFee").toString())).isEqualByComparingTo("3.00");
        BigDecimal price = (BigDecimal) res.get("_price");
        assertThat(new BigDecimal(res.get("itemsTotal").toString())).isEqualByComparingTo(price);
        assertThat(new BigDecimal(res.get("total").toString())).isEqualByComparingTo(price.add(new BigDecimal("3.00")));
        assertThat((String) res.get("whatsappText")).contains("🛵 Entrega (1,5 km × R$ 2,00/km): R$ 3,00");

        assertThat(redis.opsForValue().get("geo:01310100").block()).isEqualTo("-23.5605,-46.6333");
        quote("01310100");
        assertThat(AWESOME.getRequestCount()).isEqualTo(before + 1); // segunda vez veio do cache
    }

    @Test
    @SuppressWarnings("unchecked")
    void outOfAreaCannotBeSent() {
        Map<String, Object> res = quote("20040-020");
        assertThat(((Map<String, Object>) res.get("delivery")).get("status")).isEqualTo("OUT_OF_AREA");
        assertThat(res.get("whatsappText")).isNull();
        assertThat(new BigDecimal(res.get("deliveryFee").toString())).isZero();
    }

    @Test
    @SuppressWarnings("unchecked")
    void fallsBackToBrasilApiAndUnknownCepIsAgreedWithTheStore() {
        redis.delete("geo:04538133").block();
        Map<String, Object> viaFallback = quote("04538-133");
        assertThat(((Map<String, Object>) viaFallback.get("delivery")).get("status")).isEqualTo("OK");

        Map<String, Object> unknown = quote("99999-999");
        assertThat(((Map<String, Object>) unknown.get("delivery")).get("status")).isEqualTo("UNKNOWN");
        assertThat((String) unknown.get("whatsappText")).contains("Entrega: _a combinar_").contains("_+ entrega_");
    }

    @Test
    void calculatorBeanWorksDirectly() {
        assertThat(calculator.quote("01310100").block().status()).isEqualTo(DeliveryQuote.Status.OK);
    }
}
