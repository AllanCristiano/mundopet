package br.com.mundopet.catalog.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;

import br.com.mundopet.catalog.internal.CatalogEnums.Fulfillment;
import br.com.mundopet.catalog.internal.CatalogEnums.Sort;
import br.com.mundopet.shared.NotFoundException;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

/** Unitarios + falha do modulo catalog (banco simulado). */
class CatalogUnitTest {

    static Product product(String sku, String price, String promo, int stock) {
        return Product.of(UUID.randomUUID(), sku, "Ração " + sku, "Marca", "CAO", "ADULTO", "TODOS", "PREMIUM", null,
                new BigDecimal("10"), new BigDecimal(price), promo == null ? null : new BigDecimal(promo),
                promo == null ? null : OffsetDateTime.now().plusDays(1), stock, "#000000", null);
    }

    // ---------------- Product ----------------

    @Test
    void productComputesDiscountEffectivePriceAndPricePerKg() {
        Product p = product("A", "200.00", "150.00", 5);
        assertThat(p.discountPercent()).isEqualTo(25);
        assertThat(p.effectivePrice()).isEqualByComparingTo("150.00");
        assertThat(p.pricePerKg()).isEqualByComparingTo("15.00");
        assertThat(p.inStock()).isTrue();

        Product noPromo = product("B", "99.90", null, 0);
        assertThat(noPromo.discountPercent()).isNull();
        assertThat(noPromo.promoEndsAt()).isNull();
        assertThat(noPromo.inStock()).isFalse();
    }

    // ---------------- ProductQuery ----------------

    @Test
    void queryNormalizesTermsAndBrands() {
        ProductQuery q = ProductQuery.of("  ração   gato salmão ", null, null, null, null, List.of(" Vita Pet ", "Vita Pet", ""),
                null, null, false, null, 0, 12);
        assertThat(q.terms()).containsExactly("ração", "gato", "salmão");
        assertThat(q.brands()).containsExactly("Vita Pet");
        assertThat(q.sort()).isEqualTo(Sort.RELEVANCE);
    }

    @Test
    void queryLimitsTermsCount() {
        ProductQuery q = ProductQuery.of("a b c d e f g h", null, null, null, null, null, null, null, false, null, 0, 12);
        assertThat(q.terms()).hasSize(ProductQuery.MAX_TERMS);
    }

    @Test
    void queryRejectsAbusiveOrInvalidInput() {
        assertThatThrownBy(() -> ProductQuery.of("x".repeat(61), null, null, null, null, null, null, null, false, null, 0, 12))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> ProductQuery.of(null, null, null, null, null, null, null, null, false, null, 0, 1000))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> ProductQuery.of(null, null, null, null, null, null, null, null, false, null, -1, 12))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> ProductQuery.of(null, null, null, null, null, null, new BigDecimal("50"), new BigDecimal("10"),
                false, null, 0, 12)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> ProductQuery.of(null, null, null, null, null, null, new BigDecimal("-1"), null, false, null, 0, 12))
                .isInstanceOf(IllegalArgumentException.class);
        List<String> manyBrands = java.util.stream.IntStream.range(0, 21).mapToObj(i -> "b" + i).toList();
        assertThatThrownBy(() -> ProductQuery.of(null, null, null, null, null, manyBrands, null, null, false, null, 0, 12))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void likeLiteralEscapesWildcards() {
        assertThat(ProductQuery.likeLiteral("50%_OFF\\")).isEqualTo("%50\\%\\_off\\\\%");
    }

    // ---------------- Formatter ----------------

    @Test
    void whatsappMessageLooksLikeACatalogOrder() {
        var formatter = new WhatsAppMessageFormatter();
        var promo = new CartQuote.Line(UUID.randomUUID(), "NP-1", "Ração NutriPata Adultos", "NutriPata", new BigDecimal("15"),
                2, new BigDecimal("199.90"), new BigDecimal("229.90"), new BigDecimal("399.80"), true, null);
        var normal = new CartQuote.Line(UUID.randomUUID(), "VP-2", "Ração Vita Pet Mini", "Vita Pet", new BigDecimal("1.5"),
                1, new BigDecimal("54.90"), new BigDecimal("54.90"), new BigDecimal("54.90"), false, "Apenas 1 em estoque");

        String text = formatter.format(List.of(promo, normal), 3, new BigDecimal("514.70"), new BigDecimal("60.00"),
                new BigDecimal("454.70"), "Ana *Maria*\nSilva", Fulfillment.DELIVERY, "Tocar o interfone");

        assertThat(text)
                .startsWith("🐾 *MUNDOPET · PEDIDO DE RAÇÕES*")
                .contains("Sou *Ana Maria Silva*")
                .contains("1️⃣ *Ração NutriPata Adultos*")
                .contains("NutriPata · 15 kg · cód. NP-1")
                .contains("2 un × ~R$ 229,90~ R$ 199,90 🔥")
                .contains("Subtotal: *R$ 399,80*")
                .contains("1 un × R$ 54,90")
                .contains("1,5 kg")
                .contains("⚠️ _Apenas 1 em estoque_")
                .contains("🛒 Itens: 3")
                .contains("🏷️ Descontos: -R$ 60,00")
                .contains("✅ *TOTAL: R$ 454,70*")
                .contains("🛵 *Entrega*")
                .contains("📝 Obs.: Tocar o interfone")
                .doesNotContain(" ");
    }

    @Test
    void whatsappMessageWithoutDiscountNameOrNotes() {
        var line = new CartQuote.Line(UUID.randomUUID(), "X", "Ração X", "M", BigDecimal.ONE, 1, BigDecimal.TEN, BigDecimal.TEN,
                BigDecimal.TEN, false, null);
        String text = new WhatsAppMessageFormatter().format(List.of(line), 1, BigDecimal.TEN, BigDecimal.ZERO, BigDecimal.TEN,
                "  ", null, null);
        assertThat(text).contains("Olá! Gostaria de fazer este pedido").contains("🏬 *Retirada na loja*")
                .doesNotContain("Descontos").doesNotContain("Obs.");
    }

    @Test
    void deliveryMessageHasAddressBlockAndMapsLink() {
        var line = new CartQuote.Line(UUID.randomUUID(), "X", "Ração X", "M", BigDecimal.ONE, 1, BigDecimal.TEN, BigDecimal.TEN,
                BigDecimal.TEN, false, null);
        var address = new CartQuote.DeliveryAddress("01001-000", "Praça da Sé", "100", "Apto *12*", "Sé", "São Paulo", "sp",
                "Perto da\ncatedral");
        String text = new WhatsAppMessageFormatter().format(List.of(line), 1, BigDecimal.TEN, BigDecimal.ZERO, BigDecimal.TEN,
                null, Fulfillment.DELIVERY, null, address);
        assertThat(text)
                .contains("🛵 *Entrega no endereço:*")
                .contains("📍 Praça da Sé, 100 - Apto 12")
                .contains("Sé · São Paulo/SP")
                .contains("CEP 01001-000")
                .contains("Ref.: Perto da catedral")
                .contains("🗺️ https://www.google.com/maps/search/?api=1&query=Pra%C3%A7a+da+S%C3%A9%2C+100%2C+S%C3%A9")
                .doesNotContain("vou enviar o endereço");
    }

    @Test
    void deliveryWithoutAddressIsRejected() {
        var req = new CartQuote.Request(List.of(new CartQuote.Item(UUID.randomUUID(), 1)), null, Fulfillment.DELIVERY, null);
        StepVerifier.create(service.quote(req)).expectError(IllegalArgumentException.class).verify();
        verify(repo, never()).findByIds(any());
    }

    @Test
    void addressIsIgnoredForPickup() {
        Product a = product("A", "10.00", null, 5);
        when(repo.findByIds(any())).thenReturn(Flux.just(a));
        var address = new CartQuote.DeliveryAddress("01001-000", "Rua X", "1", null, "B", "C", "SP", null);
        var req = new CartQuote.Request(List.of(new CartQuote.Item(a.id(), 1)), null, Fulfillment.PICKUP, null, address);
        StepVerifier.create(service.quote(req))
                .assertNext(r -> assertThat(r.whatsappText()).contains("Retirada na loja").doesNotContain("Rua X"))
                .verifyComplete();
    }

    @Test
    void numbersAfterNineArePlain() {
        assertThat(WhatsAppMessageFormatter.number(3)).isEqualTo("3️⃣");
        assertThat(WhatsAppMessageFormatter.number(12)).isEqualTo("12.");
    }

    // ---------------- Service: sucesso e falhas ----------------

    private final ProductRepository repo = mock(ProductRepository.class);
    private final CatalogService service = new CatalogService(repo, new WhatsAppMessageFormatter());

    @Test
    void quoteRecalculatesWithServerPricesAndMergesDuplicates() {
        Product a = product("A", "100.00", "80.00", 10);
        Product b = product("B", "50.00", null, 10);
        when(repo.findByIds(any())).thenReturn(Flux.just(a, b));

        var req = new CartQuote.Request(List.of(new CartQuote.Item(a.id(), 1), new CartQuote.Item(b.id(), 2),
                new CartQuote.Item(a.id(), 1)), "Ana", Fulfillment.PICKUP, null);

        StepVerifier.create(service.quote(req)).assertNext(r -> {
            assertThat(r.lines()).hasSize(2);
            assertThat(r.itemsCount()).isEqualTo(4);
            assertThat(r.subtotal()).isEqualByComparingTo("300.00");
            assertThat(r.total()).isEqualByComparingTo("260.00");
            assertThat(r.discount()).isEqualByComparingTo("40.00");
            assertThat(r.whatsappText()).contains("TOTAL: R$ 260,00");
        }).verifyComplete();
    }

    @Test
    void quoteSeparatesUnavailableProductsAndWarnsLowStock() {
        Product ok = product("OK", "10.00", null, 1);
        Product out = product("OUT", "10.00", null, 0);
        UUID ghost = UUID.randomUUID();
        when(repo.findByIds(any())).thenReturn(Flux.just(ok, out));

        var req = new CartQuote.Request(List.of(new CartQuote.Item(ok.id(), 3), new CartQuote.Item(out.id(), 1),
                new CartQuote.Item(ghost, 1)), null, null, null);

        StepVerifier.create(service.quote(req)).assertNext(r -> {
            assertThat(r.lines()).singleElement().satisfies(l -> assertThat(l.warning()).contains("Apenas 1"));
            assertThat(r.unavailable()).containsExactlyInAnyOrder(out.id(), ghost);
        }).verifyComplete();
    }

    @Test
    void quoteWithNothingAvailableHasNoMessage() {
        when(repo.findByIds(any())).thenReturn(Flux.empty());
        var req = new CartQuote.Request(List.of(new CartQuote.Item(UUID.randomUUID(), 1)), null, null, null);
        StepVerifier.create(service.quote(req))
                .assertNext(r -> assertThat(r.whatsappText()).isNull())
                .verifyComplete();
    }

    @Test
    void quoteRejectsMergedQuantityAboveLimitWithoutHittingDatabase() {
        UUID id = UUID.randomUUID();
        var req = new CartQuote.Request(List.of(new CartQuote.Item(id, 15), new CartQuote.Item(id, 10)), null, null, null);
        StepVerifier.create(service.quote(req)).expectError(IllegalArgumentException.class).verify();
        verify(repo, never()).findByIds(any());
    }

    @Test
    void databaseDownPropagatesAsDataAccessFailure() {
        when(repo.search(any())).thenReturn(Mono.error(new DataAccessResourceFailureException("down")));
        when(repo.findByIds(any())).thenReturn(Flux.error(new DataAccessResourceFailureException("down")));
        when(repo.facets()).thenReturn(Mono.error(new DataAccessResourceFailureException("down")));

        StepVerifier.create(service.search(ProductQuery.of(null, null, null, null, null, null, null, null, false, null, 0, 12)))
                .expectError(DataAccessResourceFailureException.class).verify();
        StepVerifier.create(service.facets()).expectError(DataAccessResourceFailureException.class).verify();
        var req = new CartQuote.Request(List.of(new CartQuote.Item(UUID.randomUUID(), 1)), null, null, null);
        StepVerifier.create(service.quote(req)).expectError(DataAccessResourceFailureException.class).verify();
    }

    @Test
    void unknownProductIsNotFound() {
        when(repo.findById(any())).thenReturn(Mono.empty());
        StepVerifier.create(service.get(UUID.randomUUID())).expectError(NotFoundException.class).verify();
    }
}
