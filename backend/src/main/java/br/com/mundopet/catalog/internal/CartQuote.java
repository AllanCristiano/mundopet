package br.com.mundopet.catalog.internal;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import br.com.mundopet.catalog.internal.CatalogEnums.Fulfillment;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** Tipos do orcamento do carrinho. */
final class CartQuote {

    private CartQuote() {
    }

    static final int MAX_LINES = 30;
    static final int MAX_QUANTITY = 20;

    record Item(@NotNull UUID productId, @Min(1) @Max(MAX_QUANTITY) int quantity) {
    }

    record Request(
            @NotEmpty @Size(max = MAX_LINES) List<@Valid @NotNull Item> items,
            @Size(max = 60) String customerName,
            Fulfillment fulfillment,
            @Size(max = 300) String notes) {
    }

    record Line(
            UUID productId,
            String sku,
            String name,
            String brand,
            BigDecimal weightKg,
            int quantity,
            BigDecimal unitPrice,
            BigDecimal originalUnitPrice,
            BigDecimal lineTotal,
            boolean promo,
            String warning) {
    }

    record Response(
            List<Line> lines,
            List<UUID> unavailable,
            int itemsCount,
            BigDecimal subtotal,
            BigDecimal discount,
            BigDecimal total,
            String whatsappText) {
    }
}
