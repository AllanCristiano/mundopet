package br.com.mundopet.catalog.internal;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import br.com.mundopet.catalog.internal.CatalogEnums.Fulfillment;
import br.com.mundopet.delivery.DeliveryQuote;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** Tipos do orcamento do carrinho. */
final class CartQuote {

    private CartQuote() {
    }

    static final int MAX_LINES = 30;
    static final int MAX_QUANTITY = 20;

    record Item(@NotNull UUID productId, @Min(1) @Max(MAX_QUANTITY) int quantity) {
    }

    /** Endereco de entrega (obrigatorio quando fulfillment = DELIVERY). */
    record DeliveryAddress(
            @NotBlank @Pattern(regexp = "\\d{5}-?\\d{3}", message = "CEP inválido") String cep,
            @NotBlank @Size(max = 120) String street,
            @NotBlank @Size(max = 10) String number,
            @Size(max = 60) String complement,
            @NotBlank @Size(max = 80) String district,
            @NotBlank @Size(max = 80) String city,
            @NotBlank @Pattern(regexp = "[A-Za-z]{2}", message = "UF inválida") String state,
            @Size(max = 120) String reference) {
    }

    record Request(
            @NotEmpty @Size(max = MAX_LINES) List<@Valid @NotNull Item> items,
            @Size(max = 60) String customerName,
            Fulfillment fulfillment,
            @Size(max = 300) String notes,
            @Valid DeliveryAddress address) {

        /** Construtor para retirada / chamadas sem endereco. */
        Request(List<Item> items, String customerName, Fulfillment fulfillment, String notes) {
            this(items, customerName, fulfillment, notes, null);
        }
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

    /**
     * total = itemsTotal + deliveryFee. delivery so vem quando o pedido e de entrega;
     * fora da area de entrega o whatsappText vem nulo (nao da para enviar).
     */
    record Response(
            List<Line> lines,
            List<UUID> unavailable,
            int itemsCount,
            BigDecimal subtotal,
            BigDecimal discount,
            BigDecimal itemsTotal,
            BigDecimal deliveryFee,
            BigDecimal total,
            DeliveryQuote delivery,
            String whatsappText) {
    }
}
