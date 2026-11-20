package br.com.mundopet.catalog.internal;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Produto como exposto na API. promoPrice so vem preenchido quando a promocao esta VIGENTE
 * (o SQL ja descarta promocoes vencidas), entao o front nunca mostra desconto expirado.
 */
record Product(
        UUID id,
        String sku,
        String name,
        String brand,
        String species,
        String lifeStage,
        String petSize,
        String line,
        String flavor,
        BigDecimal weightKg,
        BigDecimal price,
        BigDecimal promoPrice,
        OffsetDateTime promoEndsAt,
        Integer discountPercent,
        BigDecimal effectivePrice,
        BigDecimal pricePerKg,
        int stock,
        boolean inStock,
        String color,
        String description) {

    static Product of(UUID id, String sku, String name, String brand, String species, String lifeStage, String petSize,
                      String line, String flavor, BigDecimal weightKg, BigDecimal price, BigDecimal promoPrice,
                      OffsetDateTime promoEndsAt, int stock, String color, String description) {
        BigDecimal effective = promoPrice != null ? promoPrice : price;
        Integer discount = promoPrice == null ? null
                : BigDecimal.ONE.subtract(promoPrice.divide(price, 4, RoundingMode.HALF_UP))
                        .multiply(BigDecimal.valueOf(100)).setScale(0, RoundingMode.HALF_UP).intValue();
        BigDecimal perKg = effective.divide(weightKg, 2, RoundingMode.HALF_UP);
        return new Product(id, sku, name, brand, species, lifeStage, petSize, line, flavor, weightKg, price, promoPrice,
                promoPrice == null ? null : promoEndsAt, discount, effective, perKg, stock, stock > 0, color, description);
    }
}
