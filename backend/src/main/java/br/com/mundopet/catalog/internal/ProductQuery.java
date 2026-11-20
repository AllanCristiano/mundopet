package br.com.mundopet.catalog.internal;

import java.math.BigDecimal;
import java.util.Arrays;
import java.util.List;
import java.util.Objects;

import br.com.mundopet.catalog.internal.CatalogEnums.FoodLine;
import br.com.mundopet.catalog.internal.CatalogEnums.LifeStage;
import br.com.mundopet.catalog.internal.CatalogEnums.PetSize;
import br.com.mundopet.catalog.internal.CatalogEnums.Sort;
import br.com.mundopet.catalog.internal.CatalogEnums.Species;

/**
 * Filtros da busca, ja validados e normalizados.
 * Limites existem tambem como protecao contra abuso (RULES.md 4.6): pagina <= 48, busca <= 60 caracteres, etc.
 */
record ProductQuery(
        List<String> terms,
        Species species,
        List<LifeStage> lifeStages,
        List<PetSize> petSizes,
        List<FoodLine> lines,
        List<String> brands,
        BigDecimal minPrice,
        BigDecimal maxPrice,
        boolean promoOnly,
        Sort sort,
        int page,
        int pageSize) {

    static final int MAX_PAGE_SIZE = 48;
    static final int MAX_PAGE = 500;
    static final int MAX_QUERY_LENGTH = 60;
    static final int MAX_TERMS = 6;
    static final int MAX_BRANDS = 20;

    ProductQuery {
        terms = terms == null ? List.of() : terms;
        lifeStages = lifeStages == null ? List.of() : lifeStages;
        petSizes = petSizes == null ? List.of() : petSizes;
        lines = lines == null ? List.of() : lines;
        brands = brands == null ? List.of() : brands;
        sort = sort == null ? Sort.RELEVANCE : sort;
    }

    static ProductQuery of(String q, Species species, List<LifeStage> lifeStages, List<PetSize> petSizes,
                           List<FoodLine> lines, List<String> brands, BigDecimal minPrice, BigDecimal maxPrice,
                           boolean promoOnly, Sort sort, int page, int pageSize) {
        if (q != null && q.length() > MAX_QUERY_LENGTH) {
            throw new IllegalArgumentException("Busca muito longa (máximo " + MAX_QUERY_LENGTH + " caracteres)");
        }
        if (pageSize < 1 || pageSize > MAX_PAGE_SIZE || page < 0 || page > MAX_PAGE) {
            throw new IllegalArgumentException("Paginação inválida (pageSize entre 1 e " + MAX_PAGE_SIZE + ")");
        }
        if (brands != null && brands.size() > MAX_BRANDS) {
            throw new IllegalArgumentException("Marcas demais no filtro (máximo " + MAX_BRANDS + ")");
        }
        if ((minPrice != null && minPrice.signum() < 0) || (maxPrice != null && maxPrice.signum() < 0)
                || (minPrice != null && maxPrice != null && minPrice.compareTo(maxPrice) > 0)) {
            throw new IllegalArgumentException("Faixa de preço inválida");
        }
        List<String> terms = q == null ? List.of()
                : Arrays.stream(q.trim().split("\\s+")).filter(t -> !t.isBlank()).limit(MAX_TERMS).toList();
        List<String> cleanBrands = brands == null ? List.of()
                : brands.stream().filter(Objects::nonNull).map(String::trim).filter(b -> !b.isEmpty()).distinct().toList();
        return new ProductQuery(terms, species, distinct(lifeStages), distinct(petSizes), distinct(lines), cleanBrands,
                minPrice, maxPrice, promoOnly, sort, page, pageSize);
    }

    private static <T> List<T> distinct(List<T> list) {
        return list == null ? List.of() : list.stream().filter(Objects::nonNull).distinct().toList();
    }

    /** Escapa curingas do LIKE para o texto do usuario ser tratado literalmente. */
    static String likeLiteral(String term) {
        return "%" + term.toLowerCase().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
    }
}
