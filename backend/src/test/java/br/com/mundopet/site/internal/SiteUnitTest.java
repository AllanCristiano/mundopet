package br.com.mundopet.site.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.io.InputStream;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.function.UnaryOperator;

import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

/** Unitarios + falha do modulo do site. */
class SiteUnitTest {

    static final ObjectMapper JSON = new ObjectMapper().registerModule(new JavaTimeModule());
    static final Validator VALIDATOR = Validation.buildDefaultValidatorFactory().getValidator();

    static String fixtureJson() {
        try (InputStream in = SiteUnitTest.class.getResourceAsStream("/site-settings.json")) {
            return new String(in.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    static SiteSettings valid() {
        try {
            return JSON.readValue(fixtureJson(), SiteSettings.class);
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    static Set<String> errors(SiteSettings s) {
        Set<String> paths = new java.util.TreeSet<>();
        for (ConstraintViolation<SiteSettings> v : VALIDATOR.validate(s)) {
            paths.add(v.getPropertyPath().toString());
        }
        return paths;
    }

    // ---------------- Validacao ----------------

    @Test
    void fixtureIsValid() {
        assertThat(errors(valid())).isEmpty();
    }

    @Test
    void rejectsDangerousLinksBadPhoneAndCoordinatesOutsideBrazil() {
        SiteSettings s = valid();
        var store = new SiteSettings.Store(s.store().name(), null, "11 9999-8888", null, "javascript:alert(1)",
                "http://facebook.com/x", "nao-e-email");
        var address = new SiteSettings.Address("Rua", null, "Cidade", "São Paulo", "123", 10, 0, null);
        var bad = new SiteSettings(store, address, s.hours(), s.announcement(), s.hero(), s.cta(), s.chapters(), s.stats(), s.delivery());
        assertThat(errors(bad)).contains("store.whatsapp", "store.instagram", "store.facebook", "store.email",
                "address.state", "address.zip", "address.lat", "address.lng");
    }

    @Test
    void chaptersMustBeTheFourKnownOnesOnce() {
        SiteSettings s = valid();
        List<SiteSettings.Chapter> dup = new ArrayList<>(s.chapters());
        dup.set(3, s.chapters().get(0));
        assertThat(errors(with(s, x -> new SiteSettings(x.store(), x.address(), x.hours(), x.announcement(), x.hero(), x.cta(),
                dup, x.stats(), x.delivery())))).contains("chaptersUnique");

        var unknown = new SiteSettings.Chapter("loja", true, null, "T", null, null, List.of(), "C");
        List<SiteSettings.Chapter> withUnknown = new ArrayList<>(s.chapters());
        withUnknown.set(0, unknown);
        assertThat(errors(with(s, x -> new SiteSettings(x.store(), x.address(), x.hours(), x.announcement(), x.hero(), x.cta(),
                withUnknown, x.stats(), x.delivery())))).anyMatch(p -> p.startsWith("chapters[0].id"));

        var tooManyFeatures = new SiteSettings.Chapter("hotel", true, null, "T", null, null,
                List.of("1", "2", "3", "4", "5", "6", "7"), "C");
        List<SiteSettings.Chapter> big = new ArrayList<>(s.chapters());
        big.set(0, tooManyFeatures);
        assertThat(errors(with(s, x -> new SiteSettings(x.store(), x.address(), x.hours(), x.announcement(), x.hero(), x.cta(),
                big, x.stats(), x.delivery())))).anyMatch(p -> p.startsWith("chapters[0].features"));
    }

    @Test
    void announcementOnNeedsTextAndDeliveryHasLimits() {
        SiteSettings s = valid();
        var bad = new SiteSettings(s.store(), s.address(), s.hours(), new SiteSettings.Announcement(true, " "), s.hero(), s.cta(),
                s.chapters(), s.stats(), new SiteSettings.Delivery(new java.math.BigDecimal("-1"), new java.math.BigDecimal("0.1")));
        assertThat(errors(bad)).contains("announcement.textPresentWhenEnabled", "delivery.pricePerKm", "delivery.maxKm");
        var off = new SiteSettings(s.store(), s.address(), s.hours(), new SiteSettings.Announcement(false, null), s.hero(), s.cta(),
                s.chapters(), s.stats(), s.delivery());
        assertThat(errors(off)).isEmpty();
    }

    static SiteSettings with(SiteSettings s, UnaryOperator<SiteSettings> f) {
        return f.apply(s);
    }

    @Test
    void normalizeUppercasesStateAndTrims() {
        SiteSettings n = SiteService.normalize(valid());
        assertThat(n.address().state()).isEqualTo("SP");
        assertThat(n.address().street()).isEqualTo("Rua das Flores, 100");
    }

    // ---------------- Servico ----------------

    private final SiteRepository repo = mock(SiteRepository.class);

    static SiteRepository.Row row(int version) {
        return new SiteRepository.Row(fixtureJson(), version, OffsetDateTime.now());
    }

    @Test
    void withoutSavedSettingsReturnsEmptySnapshotAndNoDeliveryOverride() {
        when(repo.find()).thenReturn(Mono.empty());
        var service = new SiteService(repo, JSON);
        StepVerifier.create(service.current()).assertNext(s -> {
            assertThat(s.version()).isZero();
            assertThat(s.settings()).isNull();
        }).verifyComplete();
        StepVerifier.create(service.delivery()).verifyComplete();
    }

    @Test
    void readsAreCachedAndSavingRefreshes() {
        when(repo.find()).thenReturn(Mono.just(row(3)));
        var service = new SiteService(repo, JSON, Duration.ofMinutes(1));
        service.current().block();
        service.current().block();
        verify(repo, times(1)).find();

        when(repo.save(anyString(), anyInt())).thenReturn(Mono.just(row(4)));
        StepVerifier.create(service.save(new SiteService.Update(3, valid())))
                .assertNext(s -> assertThat(s.version()).isEqualTo(4)).verifyComplete();
        when(repo.find()).thenReturn(Mono.just(row(4)));
        assertThat(service.current().block().version()).isEqualTo(4);
        verify(repo, times(2)).find();
    }

    @Test
    void deliveryOverrideComesFromAddressAndDeliverySections() {
        when(repo.find()).thenReturn(Mono.just(row(1)));
        StepVerifier.create(new SiteService(repo, JSON).delivery()).assertNext(d -> {
            assertThat(d.lat()).isEqualTo(-23.5605);
            assertThat(d.pricePerKm()).isEqualByComparingTo("3.50");
            assertThat(d.maxKm()).isEqualByComparingTo("10");
        }).verifyComplete();
    }

    @Test
    void staleVersionIsConflict() {
        when(repo.find()).thenReturn(Mono.just(row(5)));
        when(repo.save(anyString(), anyInt())).thenReturn(Mono.empty());
        StepVerifier.create(new SiteService(repo, JSON).save(new SiteService.Update(4, valid())))
                .expectErrorSatisfies(e -> assertThat(((ResponseStatusException) e).getStatusCode()).isEqualTo(HttpStatus.CONFLICT))
                .verify();
    }

    @Test
    void databaseDownIsNotCachedAndDeliveryFallsBackSilently() {
        when(repo.find()).thenReturn(Mono.error(new DataAccessResourceFailureException("down")));
        var service = new SiteService(repo, JSON, Duration.ofMinutes(1));
        StepVerifier.create(service.current()).expectError(DataAccessResourceFailureException.class).verify();
        StepVerifier.create(service.delivery()).verifyComplete();
        when(repo.find()).thenReturn(Mono.just(row(2)));
        assertThat(service.current().block().version()).isEqualTo(2); // erro nao ficou em cache
    }

    @Test
    void corruptedRowIsReportedAsError() {
        when(repo.find()).thenReturn(Mono.just(new SiteRepository.Row("{quebrado", 1, OffsetDateTime.now())));
        StepVerifier.create(new SiteService(repo, JSON).current()).expectError(IllegalStateException.class).verify();
    }
}
