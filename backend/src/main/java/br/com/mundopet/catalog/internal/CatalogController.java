package br.com.mundopet.catalog.internal;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import br.com.mundopet.catalog.internal.CatalogEnums.FoodLine;
import br.com.mundopet.catalog.internal.CatalogEnums.LifeStage;
import br.com.mundopet.catalog.internal.CatalogEnums.PetSize;
import br.com.mundopet.catalog.internal.CatalogEnums.Sort;
import br.com.mundopet.catalog.internal.CatalogEnums.Species;
import jakarta.validation.Valid;
import reactor.core.publisher.Mono;

@RestController
@RequestMapping("/api/catalog")
class CatalogController {

    record PageResponse(List<Product> items, long total, int page, int pageSize, boolean hasMore) {
    }

    private final CatalogService service;

    CatalogController(CatalogService service) {
        this.service = service;
    }

    @GetMapping("/products")
    Mono<PageResponse> search(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) Species species,
            @RequestParam(name = "stage", required = false) List<LifeStage> stages,
            @RequestParam(name = "petSize", required = false) List<PetSize> petSizes,
            @RequestParam(name = "line", required = false) List<FoodLine> lines,
            @RequestParam(name = "brand", required = false) List<String> brands,
            @RequestParam(required = false) BigDecimal minPrice,
            @RequestParam(required = false) BigDecimal maxPrice,
            @RequestParam(defaultValue = "false") boolean promo,
            @RequestParam(defaultValue = "RELEVANCE") Sort sort,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "12") int pageSize) {
        ProductQuery query = ProductQuery.of(q, species, stages, petSizes, lines, brands, minPrice, maxPrice, promo, sort,
                page, pageSize);
        return service.search(query).map(p -> new PageResponse(p.items(), p.total(), page, pageSize,
                (long) (page + 1) * pageSize < p.total()));
    }

    @GetMapping("/facets")
    Mono<ResponseEntity<ProductRepository.Facets>> facets() {
        return service.facets().map(f -> ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(java.time.Duration.ofSeconds(60)).cachePublic())
                .body(f));
    }

    @GetMapping("/products/{id}")
    Mono<Product> get(@PathVariable UUID id) {
        return service.get(id);
    }

    /** Recalcula o carrinho e devolve a mensagem pronta para o WhatsApp. */
    @PostMapping("/cart/quote")
    Mono<CartQuote.Response> quote(@Valid @RequestBody CartQuote.Request request) {
        return service.quote(request);
    }
}
