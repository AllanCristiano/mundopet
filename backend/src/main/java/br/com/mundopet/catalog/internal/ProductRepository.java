package br.com.mundopet.catalog.internal;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Repository;

import io.r2dbc.spi.Readable;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/**
 * Consultas do catalogo com SQL explicito (R2DBC, assincrono).
 * Tudo que vem do usuario entra por bind parameter; ORDER BY so aceita valores de uma lista fixa.
 */
@Repository
class ProductRepository {

    /** Calcula a promocao VIGENTE e o preco efetivo uma unica vez para filtros, ordenacao e resposta. */
    static final String BASE = """
            WITH x AS (
                SELECT p.*,
                       CASE WHEN p.promo_price IS NOT NULL AND (p.promo_ends_at IS NULL OR p.promo_ends_at > now())
                            THEN p.promo_price END AS promo_now
                FROM catalog_products p
                WHERE p.active
            ), y AS (
                SELECT x.*, COALESCE(x.promo_now, x.price) AS eff,
                       CASE WHEN x.promo_now IS NOT NULL THEN (1 - x.promo_now / x.price) END AS disc
                FROM x
            )
            """;

    static final Map<CatalogEnums.Sort, String> ORDER = Map.of(
            CatalogEnums.Sort.RELEVANCE, "(y.promo_now IS NULL), (y.stock = 0), y.name",
            CatalogEnums.Sort.PRICE_ASC, "y.eff ASC, y.name",
            CatalogEnums.Sort.PRICE_DESC, "y.eff DESC, y.name",
            CatalogEnums.Sort.DISCOUNT, "y.disc DESC NULLS LAST, y.name",
            CatalogEnums.Sort.NAME, "y.name");

    record Page(List<Product> items, long total) {
    }

    record PriceRange(BigDecimal min, BigDecimal max, long promoCount, long total) {
    }

    record Facets(Map<String, Long> brands, PriceRange prices) {
    }

    private final DatabaseClient db;

    ProductRepository(DatabaseClient db) {
        this.db = db;
    }

    Mono<Page> search(ProductQuery q) {
        StringBuilder where = new StringBuilder(" WHERE TRUE");
        Map<String, Object> binds = new LinkedHashMap<>();

        for (int i = 0; i < q.terms().size(); i++) {
            where.append(" AND unaccent(lower(y.name || ' ' || y.brand || ' ' || coalesce(y.flavor, ''))) LIKE unaccent(:t")
                    .append(i).append(")");
            binds.put("t" + i, ProductQuery.likeLiteral(q.terms().get(i)));
        }
        if (q.species() != null) {
            where.append(" AND y.species = :species");
            binds.put("species", q.species().name());
        }
        inFilter(where, binds, "y.life_stage", "stages", names(q.lifeStages()));
        if (!q.petSizes().isEmpty()) {
            // racao "para todos os portes" aparece em qualquer filtro de porte
            where.append(" AND (y.pet_size IN (:sizes) OR y.pet_size = 'TODOS')");
            binds.put("sizes", names(q.petSizes()));
        }
        inFilter(where, binds, "y.line", "lines", names(q.lines()));
        inFilter(where, binds, "y.brand", "brands", q.brands());
        if (q.minPrice() != null) {
            where.append(" AND y.eff >= :minPrice");
            binds.put("minPrice", q.minPrice());
        }
        if (q.maxPrice() != null) {
            where.append(" AND y.eff <= :maxPrice");
            binds.put("maxPrice", q.maxPrice());
        }
        if (q.promoOnly()) {
            where.append(" AND y.promo_now IS NOT NULL");
        }

        String sql = BASE + "SELECT y.*, count(*) OVER () AS total FROM y" + where
                + " ORDER BY " + ORDER.get(q.sort()) + ", y.id LIMIT :limit OFFSET :offset";
        binds.put("limit", q.pageSize());
        binds.put("offset", q.page() * q.pageSize());

        DatabaseClient.GenericExecuteSpec spec = db.sql(sql);
        for (var e : binds.entrySet()) {
            spec = spec.bind(e.getKey(), e.getValue());
        }
        return spec.map((row, meta) -> new Object[] {map(row), row.get("total", Long.class)})
                .all()
                .collectList()
                .map(rows -> new Page(rows.stream().map(r -> (Product) r[0]).toList(),
                        rows.isEmpty() ? 0 : (Long) rows.get(0)[1]));
    }

    Flux<Product> findByIds(Collection<UUID> ids) {
        if (ids.isEmpty()) {
            return Flux.empty();
        }
        return db.sql(BASE + "SELECT y.* FROM y WHERE y.id IN (:ids)")
                .bind("ids", List.copyOf(ids))
                .map((row, meta) -> map(row))
                .all();
    }

    Mono<Product> findById(UUID id) {
        return findByIds(List.of(id)).next();
    }

    Mono<Facets> facets() {
        Mono<Map<String, Long>> brands = db.sql("SELECT brand, count(*) AS n FROM catalog_products WHERE active GROUP BY brand ORDER BY brand")
                .map((row, meta) -> Map.entry(row.get("brand", String.class), row.get("n", Long.class)))
                .all()
                .collectList()
                .map(list -> {
                    Map<String, Long> m = new LinkedHashMap<>();
                    list.forEach(e -> m.put(e.getKey(), e.getValue()));
                    return m;
                });
        Mono<PriceRange> prices = db.sql(BASE + "SELECT min(eff) AS mn, max(eff) AS mx, "
                        + "count(*) FILTER (WHERE promo_now IS NOT NULL) AS promos, count(*) AS total FROM y")
                .map((row, meta) -> new PriceRange(row.get("mn", BigDecimal.class), row.get("mx", BigDecimal.class),
                        row.get("promos", Long.class), row.get("total", Long.class)))
                .one();
        return Mono.zip(brands, prices).map(t -> new Facets(t.getT1(), t.getT2()));
    }

    private static void inFilter(StringBuilder where, Map<String, Object> binds, String column, String name,
                                 List<String> values) {
        if (!values.isEmpty()) {
            where.append(" AND ").append(column).append(" IN (:").append(name).append(")");
            binds.put(name, values);
        }
    }

    private static List<String> names(List<? extends Enum<?>> values) {
        List<String> out = new ArrayList<>(values.size());
        values.forEach(v -> out.add(v.name()));
        return out;
    }

    static Product map(Readable row) {
        Integer stock = row.get("stock", Integer.class);
        return Product.of(
                row.get("id", UUID.class),
                row.get("sku", String.class),
                row.get("name", String.class),
                row.get("brand", String.class),
                row.get("species", String.class),
                row.get("life_stage", String.class),
                row.get("pet_size", String.class),
                row.get("line", String.class),
                row.get("flavor", String.class),
                row.get("weight_kg", BigDecimal.class),
                row.get("price", BigDecimal.class),
                row.get("promo_now", BigDecimal.class),
                row.get("promo_ends_at", OffsetDateTime.class),
                stock == null ? 0 : stock,
                row.get("color", String.class),
                row.get("description", String.class));
    }
}
