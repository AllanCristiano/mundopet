package br.com.mundopet.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.MediaType;

import br.com.mundopet.support.IntegrationTestBase;

/** Integracao do catalogo com Postgres real + dados de exemplo (db/seed). */
class CatalogApiIT extends IntegrationTestBase {

    record Item(String id, String sku, String name, String brand, String species, String lifeStage, String petSize,
                String line, BigDecimal price, BigDecimal promoPrice, Integer discountPercent, BigDecimal effectivePrice,
                boolean inStock) {
    }

    record Page(List<Item> items, long total, int page, int pageSize, boolean hasMore) {
    }

    private Page get(String query) {
        return web.get().uri("/api/catalog/products?" + query).exchange()
                .expectStatus().isOk()
                .expectBody(Page.class).returnResult().getResponseBody();
    }

    @Test
    void listsWithPagination() {
        Page first = get("pageSize=5");
        assertThat(first.items()).hasSize(5);
        assertThat(first.total()).isGreaterThanOrEqualTo(20);
        assertThat(first.hasMore()).isTrue();

        Page second = get("pageSize=5&page=1");
        assertThat(second.items()).extracting(Item::id).doesNotContainAnyElementsOf(first.items().stream().map(Item::id).toList());
    }

    @Test
    void searchIgnoresAccentsAndCaseAndCombinesTerms() {
        Page page = get("q=RACAO gato salmao&pageSize=48");
        assertThat(page.items()).isNotEmpty()
                .allSatisfy(i -> {
                    assertThat(i.species()).isEqualTo("GATO");
                    assertThat(i.name().toLowerCase()).contains("ração");
                });
    }

    @Test
    void searchTreatsWildcardsLiterally() {
        assertThat(get("q=%25&pageSize=48").items()).isEmpty();
    }

    @Test
    void filtersBySpeciesStageLineAndBrand() {
        Page page = get("species=CAO&stage=FILHOTE&pageSize=48");
        assertThat(page.items()).isNotEmpty()
                .allSatisfy(i -> assertThat(i.species() + i.lifeStage()).isEqualTo("CAOFILHOTE"));

        Page nat = get("line=NATURAL&brand=Bosque Natural&pageSize=48");
        assertThat(nat.items()).isNotEmpty().allSatisfy(i -> assertThat(i.brand()).isEqualTo("Bosque Natural"));
    }

    @Test
    void petSizeFilterIncludesAllSizesFood() {
        Page page = get("species=CAO&petSize=PEQUENO&pageSize=48");
        assertThat(page.items()).extracting(Item::petSize).containsOnly("PEQUENO", "TODOS");
    }

    @Test
    void promoFilterAndDiscountSort() {
        Page promos = get("promo=true&sort=DISCOUNT&pageSize=48");
        assertThat(promos.items()).isNotEmpty()
                .allSatisfy(i -> assertThat(i.promoPrice()).isNotNull());
        List<Integer> discounts = promos.items().stream().map(Item::discountPercent).toList();
        assertThat(discounts).isSortedAccordingTo(java.util.Comparator.reverseOrder());
    }

    @Test
    void priceRangeAndPriceSortUseEffectivePrice() {
        Page page = get("minPrice=50&maxPrice=150&sort=PRICE_ASC&pageSize=48");
        assertThat(page.items()).isNotEmpty().allSatisfy(i ->
                assertThat(i.effectivePrice()).isBetween(new BigDecimal("50"), new BigDecimal("150")));
        assertThat(page.items()).extracting(Item::effectivePrice).isSortedAccordingTo(BigDecimal::compareTo);
    }

    @Test
    void invalidParametersReturn400() {
        web.get().uri("/api/catalog/products?pageSize=1000").exchange().expectStatus().isBadRequest();
        web.get().uri("/api/catalog/products?species=PEIXE").exchange().expectStatus().isBadRequest();
        web.get().uri("/api/catalog/products?sort=DROP_TABLE").exchange().expectStatus().isBadRequest();
        web.get().uri("/api/catalog/products?minPrice=100&maxPrice=1").exchange().expectStatus().isBadRequest();
        web.get().uri("/api/catalog/products/{id}", UUID.randomUUID()).exchange().expectStatus().isNotFound();
    }

    @Test
    void facetsListBrandsAndPriceRange() {
        web.get().uri("/api/catalog/facets").exchange()
                .expectStatus().isOk()
                .expectHeader().cacheControl(org.springframework.http.CacheControl.maxAge(java.time.Duration.ofSeconds(60)).cachePublic())
                .expectBody()
                .jsonPath("$.brands['Vita Pet']").isNumber()
                .jsonPath("$.prices.min").isNumber()
                .jsonPath("$.prices.promoCount").isNumber();
    }

    @Test
    void quoteUsesServerPricesAndBuildsWhatsappMessage() {
        Item promo = get("promo=true&pageSize=1").items().get(0);
        Item regular = get("sort=NAME&pageSize=48").items().stream()
                .filter(i -> i.promoPrice() == null && i.inStock()).findFirst().orElseThrow();

        Map<String, Object> body = Map.of(
                "items", List.of(Map.of("productId", promo.id(), "quantity", 2), Map.of("productId", regular.id(), "quantity", 1)),
                "customerName", "Ana",
                "fulfillment", "PICKUP",
                "notes", "Portão azul");

        Map<String, Object> res = web.post().uri("/api/catalog/cart/quote").contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body).exchange()
                .expectStatus().isOk()
                .expectBody(new ParameterizedTypeReference<Map<String, Object>>() { })
                .returnResult().getResponseBody();

        BigDecimal expected = promo.promoPrice().multiply(BigDecimal.TWO).add(regular.price());
        assertThat(new BigDecimal(res.get("total").toString())).isEqualByComparingTo(expected);
        assertThat(res.get("itemsCount")).isEqualTo(3);
        assertThat((String) res.get("whatsappText"))
                .contains("PEDIDO DE RAÇÕES").contains(promo.sku()).contains(regular.sku())
                .contains("Sou *Ana*").contains("Retirada na loja").contains("Portão azul").contains("TOTAL:");
    }

    @Test
    void deliveryRequiresValidAddressAndPutsItInTheMessage() {
        Item item = get("sort=NAME&pageSize=48").items().stream().filter(Item::inStock).findFirst().orElseThrow();
        Map<String, Object> address = new java.util.HashMap<>(Map.of(
                "cep", "01001-000", "street", "Praça da Sé", "number", "100", "district", "Sé",
                "city", "São Paulo", "state", "SP", "complement", "Sala 3"));
        Map<String, Object> body = new java.util.HashMap<>(Map.of(
                "items", List.of(Map.of("productId", item.id(), "quantity", 1)), "fulfillment", "DELIVERY", "address", address));

        web.post().uri("/api/catalog/cart/quote").contentType(MediaType.APPLICATION_JSON).bodyValue(body).exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.whatsappText").value(t -> assertThat((String) t)
                        .contains("📍 Praça da Sé, 100 - Sala 3").contains("CEP 01001-000").contains("google.com/maps"));

        // sem endereco, sem numero, CEP ou UF invalidos => 400
        body.remove("address");
        web.post().uri("/api/catalog/cart/quote").contentType(MediaType.APPLICATION_JSON).bodyValue(body).exchange()
                .expectStatus().isBadRequest();
        for (var bad : List.of(Map.of("number", ""), Map.of("cep", "123"), Map.of("state", "São Paulo"))) {
            Map<String, Object> a = new java.util.HashMap<>(address);
            a.putAll(bad);
            body.put("address", a);
            web.post().uri("/api/catalog/cart/quote").contentType(MediaType.APPLICATION_JSON).bodyValue(body).exchange()
                    .expectStatus().isBadRequest();
        }
    }

    @Test
    void quoteReportsOutOfStockAndUnknownProducts() {
        Item outOfStock = get("q=Campeão Forte Filhotes").items().stream().filter(i -> !i.inStock()).findFirst().orElseThrow();
        String ghost = UUID.randomUUID().toString();
        Map<String, Object> body = Map.of("items", List.of(
                Map.of("productId", outOfStock.id(), "quantity", 1), Map.of("productId", ghost, "quantity", 1)));

        web.post().uri("/api/catalog/cart/quote").contentType(MediaType.APPLICATION_JSON).bodyValue(body).exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.lines.length()").isEqualTo(0)
                .jsonPath("$.unavailable.length()").isEqualTo(2)
                .jsonPath("$.whatsappText").doesNotExist();
    }

    @Test
    void quoteValidation() {
        web.post().uri("/api/catalog/cart/quote").contentType(MediaType.APPLICATION_JSON)
                .bodyValue(Map.of("items", List.of())).exchange().expectStatus().isBadRequest();
        web.post().uri("/api/catalog/cart/quote").contentType(MediaType.APPLICATION_JSON)
                .bodyValue(Map.of("items", List.of(Map.of("productId", UUID.randomUUID(), "quantity", 99))))
                .exchange().expectStatus().isBadRequest();
        web.post().uri("/api/catalog/cart/quote").contentType(MediaType.APPLICATION_JSON)
                .bodyValue(Map.of("items", List.of(Map.of("productId", UUID.randomUUID(), "quantity", 1)), "fulfillment", "DRONE"))
                .exchange().expectStatus().isBadRequest();
        List<Map<String, Object>> tooMany = java.util.stream.IntStream.range(0, 31)
                .mapToObj(i -> Map.<String, Object>of("productId", UUID.randomUUID(), "quantity", 1)).toList();
        web.post().uri("/api/catalog/cart/quote").contentType(MediaType.APPLICATION_JSON)
                .bodyValue(Map.of("items", tooMany)).exchange().expectStatus().isBadRequest();
    }
}
