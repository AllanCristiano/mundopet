package br.com.mundopet.delivery.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.math.BigDecimal;
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

import br.com.mundopet.delivery.DeliveryQuote;
import br.com.mundopet.delivery.DeliveryQuote.Status;
import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

/** Unitarios + falha do modulo de entrega. */
class DeliveryUnitTest {

    /** Loja na Praca da Se; R$ 2,00/km; raio 15 km; fator de ruas 1,3. */
    static DeliveryProperties props(Double roadFactor) {
        return new DeliveryProperties(-23.5505, -46.6333, new BigDecimal("2.00"), new BigDecimal("15"), roadFactor,
                null, null, Duration.ofMillis(500), null);
    }

    static final DeliveryProperties PROPS = props(1.0);

    // ---------------- Distancia e configuracao ----------------

    @Test
    void haversineDistance() {
        GeoPoint a = new GeoPoint(-23.5505, -46.6333);
        // 0,01 grau de latitude ~ 1,112 km
        assertThat(a.distanceKm(new GeoPoint(-23.5605, -46.6333))).isBetween(1.10, 1.12);
        // Se -> Rio de Janeiro (Centro) ~ 360 km
        assertThat(a.distanceKm(new GeoPoint(-22.9035, -43.2096))).isBetween(355.0, 365.0);
        assertThat(a.distanceKm(a)).isZero();
    }

    @Test
    void geoPointValidationAndCacheEncoding() {
        assertThat(GeoPoint.isValid(-23.5, -46.6)).isTrue();
        assertThat(GeoPoint.isValid(0, 0)).isFalse();
        assertThat(GeoPoint.isValid(-23.5, 46.6)).isFalse();
        GeoPoint p = new GeoPoint(-23.55, -46.63);
        assertThat(GeoPoint.decode(p.encode())).isEqualTo(p);
    }

    @Test
    void propertiesHaveDefaultsAndRejectNonsense() {
        var d = new DeliveryProperties(null, null, null, null, null, null, null, null, null);
        assertThat(d.pricePerKm()).isEqualByComparingTo("2.00");
        assertThat(d.maxKm()).isEqualByComparingTo("15");
        assertThat(d.roadFactor()).isEqualTo(1.3);
        assertThat(d.awesomeapiUrl()).startsWith("https://");
        assertThat(d.cacheTtl()).isEqualTo(Duration.ofDays(30));

        assertThatThrownBy(() -> new DeliveryProperties(0.0, 0.0, null, null, null, null, null, null, null))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new DeliveryProperties(null, null, new BigDecimal("-1"), null, null, null, null, null, null))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new DeliveryProperties(null, null, null, BigDecimal.ZERO, null, null, null, null, null))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new DeliveryProperties(null, null, null, null, 0.5, null, null, null, null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    // ---------------- Calculo da taxa ----------------

    private final GeoCache cache = mock(GeoCache.class);

    @BeforeEach
    void cacheMiss() {
        when(cache.get(anyString())).thenReturn(Mono.empty());
        when(cache.put(anyString(), any())).thenAnswer(inv -> Mono.just(inv.getArgument(1)));
    }

    static Geocoder geocoder(String name, Mono<GeoPoint> result, AtomicInteger calls) {
        return new Geocoder() {
            public String name() { return name; }
            public Mono<GeoPoint> locate(String cep) { return Mono.defer(() -> { calls.incrementAndGet(); return result; }); }
        };
    }

    @Test
    void feeIsKmRoundedUpTimesPricePerKm() {
        var calc = new DistanceDeliveryCalculator(PROPS, cache, List.of());
        // 1,112 km -> arredonda para cima: 1,2 km x R$ 2,00 = R$ 2,40
        DeliveryQuote q = calc.priced(new GeoPoint(-23.5605, -46.6333));
        assertThat(q.status()).isEqualTo(Status.OK);
        assertThat(q.distanceKm()).isEqualByComparingTo("1.2");
        assertThat(q.fee()).isEqualByComparingTo("2.40");
        assertThat(q.pricePerKm()).isEqualByComparingTo("2.00");
        assertThat(q.deliverable()).isTrue();

        // o fator de ruas aumenta a distancia: 1,112 x 1,3 = 1,446 -> 1,5 km = R$ 3,00
        var withRoads = new DistanceDeliveryCalculator(props(1.3), cache, List.of());
        assertThat(withRoads.priced(new GeoPoint(-23.5605, -46.6333)).fee()).isEqualByComparingTo("3.00");

        // na porta da loja: 0 km = R$ 0,00
        assertThat(calc.priced(PROPS.store()).fee()).isEqualByComparingTo("0.00");
    }

    @Test
    void beyondMaxRadiusIsOutOfArea() {
        var calc = new DistanceDeliveryCalculator(PROPS, cache, List.of());
        DeliveryQuote q = calc.priced(new GeoPoint(-22.9035, -43.2096)); // Rio
        assertThat(q.status()).isEqualTo(Status.OUT_OF_AREA);
        assertThat(q.fee()).isNull();
        assertThat(q.distanceKm()).isGreaterThan(new BigDecimal("15"));
        assertThat(q.deliverable()).isFalse();
    }

    @Test
    void usesFirstGeocoderThatKnowsTheCepAndCachesIt() {
        AtomicInteger a = new AtomicInteger();
        AtomicInteger b = new AtomicInteger();
        GeoPoint point = new GeoPoint(-23.5605, -46.6333);
        var calc = new DistanceDeliveryCalculator(PROPS, cache, List.of(
                geocoder("A", Mono.empty(), a), geocoder("B", Mono.just(point), b)));

        StepVerifier.create(calc.quote("01001-000"))
                .assertNext(q -> assertThat(q.fee()).isEqualByComparingTo("2.40"))
                .verifyComplete();
        assertThat(a).hasValue(1);
        assertThat(b).hasValue(1);
        verify(cache).put("01001000", point);
    }

    @Test
    void geocoderDownFallsBackToNext() {
        AtomicInteger calls = new AtomicInteger();
        var calc = new DistanceDeliveryCalculator(PROPS, cache, List.of(
                geocoder("A", Mono.error(new IllegalStateException("fora do ar")), calls),
                geocoder("B", Mono.just(new GeoPoint(-23.5605, -46.6333)), calls)));
        StepVerifier.create(calc.quote("01001000"))
                .assertNext(q -> assertThat(q.status()).isEqualTo(Status.OK))
                .verifyComplete();
        assertThat(calls).hasValue(2);
    }

    @Test
    void cacheHitSkipsGeocoders() {
        when(cache.get("01001000")).thenReturn(Mono.just(new GeoPoint(-23.5605, -46.6333)));
        AtomicInteger calls = new AtomicInteger();
        var calc = new DistanceDeliveryCalculator(PROPS, cache, List.of(geocoder("A", Mono.empty(), calls)));
        StepVerifier.create(calc.quote("01001000"))
                .assertNext(q -> assertThat(q.status()).isEqualTo(Status.OK))
                .verifyComplete();
        assertThat(calls).hasValue(0);
    }

    @Test
    void nobodyKnowsOrEverybodyIsDownMeansUnknownNeverAnError() {
        AtomicInteger calls = new AtomicInteger();
        var calc = new DistanceDeliveryCalculator(PROPS, cache, List.of(
                geocoder("A", Mono.error(new IllegalStateException("x")), calls), geocoder("B", Mono.empty(), calls)));
        StepVerifier.create(calc.quote("01001000")).assertNext(q -> {
            assertThat(q.status()).isEqualTo(Status.UNKNOWN);
            assertThat(q.fee()).isNull();
            assertThat(q.distanceKm()).isNull();
            assertThat(q.deliverable()).isTrue();
        }).verifyComplete();
        verify(cache, never()).put(anyString(), any());
    }

    @Test
    void invalidCepIsUnknownWithoutCallingAnything() {
        AtomicInteger calls = new AtomicInteger();
        var calc = new DistanceDeliveryCalculator(PROPS, cache, List.of(geocoder("A", Mono.empty(), calls)));
        StepVerifier.create(calc.quote("123")).assertNext(q -> assertThat(q.status()).isEqualTo(Status.UNKNOWN)).verifyComplete();
        StepVerifier.create(calc.quote(null)).assertNext(q -> assertThat(q.status()).isEqualTo(Status.UNKNOWN)).verifyComplete();
        assertThat(calls).hasValue(0);
        verify(cache, never()).get(anyString());
    }

    // ---------------- Cache: falha aberta ----------------

    @Test
    @SuppressWarnings("unchecked")
    void cacheFailsOpenWhenRedisIsDownOrValueIsGarbage() {
        ReactiveStringRedisTemplate redis = mock(ReactiveStringRedisTemplate.class);
        ReactiveValueOperations<String, String> ops = mock(ReactiveValueOperations.class);
        when(redis.opsForValue()).thenReturn(ops);
        var geo = new GeoCache(redis, PROPS);
        GeoPoint p = new GeoPoint(-23.55, -46.63);

        when(ops.get("geo:01001000")).thenReturn(Mono.error(new RedisConnectionFailureException("down")));
        when(ops.set(anyString(), anyString(), any(Duration.class))).thenReturn(Mono.error(new RedisConnectionFailureException("down")));
        StepVerifier.create(geo.get("01001000")).verifyComplete();
        StepVerifier.create(geo.put("01001000", p)).expectNext(p).verifyComplete();

        when(ops.get("geo:01001000")).thenReturn(Mono.just("lixo"));
        StepVerifier.create(geo.get("01001000")).verifyComplete();

        when(ops.get("geo:01001000")).thenReturn(Mono.just(p.encode()));
        StepVerifier.create(geo.get("01001000")).expectNext(p).verifyComplete();
    }

    // ---------------- Fontes HTTP (servidor falso) ----------------

    private MockWebServer server;

    @AfterEach
    void stop() throws IOException {
        if (server != null) {
            server.shutdown();
        }
    }

    private Geocoders.HttpGeocoder http(boolean brasilApi) throws IOException {
        server = new MockWebServer();
        server.start();
        WebClient client = WebClient.builder().baseUrl(server.url("/").toString()).build();
        return brasilApi
                ? new Geocoders.HttpGeocoder("BrasilAPI", client, PROPS, Geocoders.HttpGeocoder::fromBrasilApi)
                : new Geocoders.HttpGeocoder("AwesomeAPI", client, PROPS, Geocoders.HttpGeocoder::fromAwesomeApi);
    }

    static MockResponse json(int status, String body) {
        return new MockResponse().setResponseCode(status).setHeader("Content-Type", "application/json").setBody(body);
    }

    @Test
    void awesomeApiFoundNotFoundAndDown() throws Exception {
        var g = http(false);
        assertThat(g.name()).isEqualTo("AwesomeAPI");
        server.enqueue(json(200, "{\"cep\":\"01001000\",\"lat\":\"-23.5500806\",\"lng\":\"-46.6340827\"}"));
        server.enqueue(json(404, "{\"code\":\"not_found\"}"));
        server.enqueue(json(500, "{}"));
        server.enqueue(json(200, "{\"lat\":\"0\",\"lng\":\"0\"}"));

        StepVerifier.create(g.locate("01001000")).expectNext(new GeoPoint(-23.5500806, -46.6340827)).verifyComplete();
        assertThat(server.takeRequest().getPath()).isEqualTo("/01001000");
        StepVerifier.create(g.locate("99999999")).verifyComplete();
        StepVerifier.create(g.locate("01001000")).expectError().verify();
        StepVerifier.create(g.locate("01001000")).verifyComplete(); // coordenada absurda e descartada
    }

    @Test
    void brasilApiWithAndWithoutCoordinates() throws Exception {
        var g = http(true);
        server.enqueue(json(200, """
                {"cep":"01001000","location":{"type":"Point","coordinates":{"longitude":"-46.633081","latitude":"-23.5503898"}}}"""));
        server.enqueue(json(200, "{\"cep\":\"13560000\",\"location\":{\"type\":\"Point\",\"coordinates\":{}}}"));
        StepVerifier.create(g.locate("01001000")).expectNext(new GeoPoint(-23.5503898, -46.633081)).verifyComplete();
        StepVerifier.create(g.locate("13560000")).verifyComplete();
    }

    @Test
    void slowSourceTimesOut() throws Exception {
        var g = http(false);
        server.enqueue(json(200, "{\"lat\":\"-23.5\",\"lng\":\"-46.6\"}").setBodyDelay(2, TimeUnit.SECONDS));
        StepVerifier.create(g.locate("01001000")).expectError(java.util.concurrent.TimeoutException.class).verify();
    }

    @Test
    void parserIgnoresMissingOrBrokenValues() {
        assertThat(Geocoders.HttpGeocoder.fromAwesomeApi(Map.of())).isNull();
        assertThat(Geocoders.HttpGeocoder.fromAwesomeApi(Map.of("lat", "abc", "lng", "-46"))).isNull();
        assertThat(Geocoders.HttpGeocoder.fromBrasilApi(Map.of())).isNull();
        assertThat(Geocoders.HttpGeocoder.fromBrasilApi(Map.of("location", "x"))).isNull();
    }
}
