package br.com.mundopet.catalog.internal;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;

import org.springframework.stereotype.Service;

import br.com.mundopet.delivery.DeliveryCalculator;
import br.com.mundopet.delivery.DeliveryQuote;
import br.com.mundopet.shared.NotFoundException;
import reactor.core.publisher.Mono;

@Service
class CatalogService {

    private final ProductRepository repository;
    private final WhatsAppMessageFormatter formatter;
    private final DeliveryCalculator delivery;

    CatalogService(ProductRepository repository, WhatsAppMessageFormatter formatter, DeliveryCalculator delivery) {
        this.repository = repository;
        this.formatter = formatter;
        this.delivery = delivery;
    }

    Mono<ProductRepository.Page> search(ProductQuery query) {
        return repository.search(query);
    }

    Mono<ProductRepository.Facets> facets() {
        return repository.facets();
    }

    Mono<Product> get(UUID id) {
        return repository.findById(id).switchIfEmpty(Mono.error(() -> new NotFoundException("Produto não encontrado")));
    }

    /**
     * Recalcula o carrinho com os precos ATUAIS do banco (nunca confia no preco enviado pelo navegador).
     * Produto inexistente, inativo ou sem estoque vai para "unavailable" em vez de derrubar o pedido inteiro.
     */
    Mono<CartQuote.Response> quote(CartQuote.Request request) {
        return Mono.defer(() -> priced(request));
    }

    private Mono<CartQuote.Response> priced(CartQuote.Request request) {
        if (request.fulfillment() == CatalogEnums.Fulfillment.DELIVERY && request.address() == null) {
            return Mono.error(new IllegalArgumentException("Informe o endereço de entrega"));
        }
        Map<UUID, Integer> quantities = new LinkedHashMap<>();
        for (CartQuote.Item item : request.items()) {
            int merged = quantities.merge(item.productId(), item.quantity(), Integer::sum);
            if (merged > CartQuote.MAX_QUANTITY) {
                return Mono.error(new IllegalArgumentException("Quantidade máxima por produto: " + CartQuote.MAX_QUANTITY));
            }
        }

        boolean isDelivery = request.fulfillment() == CatalogEnums.Fulfillment.DELIVERY;
        Mono<DeliveryQuote> fee = isDelivery ? delivery.quote(request.address().cep()) : Mono.just(NO_DELIVERY);
        return repository.findByIds(quantities.keySet())
                .collectMap(Product::id, Function.identity())
                .zipWith(fee)
                .map(t -> build(request, quantities, t.getT1(), isDelivery ? t.getT2() : null));
    }

    /** Marcador interno para retirada (Mono.zip nao aceita vazio). */
    private static final DeliveryQuote NO_DELIVERY = new DeliveryQuote(DeliveryQuote.Status.UNKNOWN, null, null, null, null);

    private CartQuote.Response build(CartQuote.Request request, Map<UUID, Integer> quantities, Map<UUID, Product> products,
                                     DeliveryQuote deliveryQuote) {
        List<CartQuote.Line> lines = new ArrayList<>();
        List<UUID> unavailable = new ArrayList<>();
        BigDecimal subtotal = BigDecimal.ZERO;
        BigDecimal total = BigDecimal.ZERO;
        int count = 0;

        for (var entry : quantities.entrySet()) {
            Product p = products.get(entry.getKey());
            if (p == null || !p.inStock()) {
                unavailable.add(entry.getKey());
                continue;
            }
            int qty = entry.getValue();
            BigDecimal unit = p.effectivePrice();
            BigDecimal lineTotal = unit.multiply(BigDecimal.valueOf(qty));
            String warning = qty > p.stock() ? "Apenas " + p.stock() + " em estoque — a loja confirma a disponibilidade" : null;
            lines.add(new CartQuote.Line(p.id(), p.sku(), p.name(), p.brand(), p.weightKg(), qty, unit, p.price(),
                    lineTotal, p.promoPrice() != null, warning));
            subtotal = subtotal.add(p.price().multiply(BigDecimal.valueOf(qty)));
            total = total.add(lineTotal);
            count += qty;
        }

        BigDecimal discount = subtotal.subtract(total);
        BigDecimal fee = deliveryQuote != null && deliveryQuote.fee() != null ? deliveryQuote.fee() : BigDecimal.ZERO;
        BigDecimal grandTotal = total.add(fee);
        boolean canSend = !lines.isEmpty() && (deliveryQuote == null || deliveryQuote.deliverable());
        String text = !canSend ? null
                : formatter.format(lines, count, subtotal, discount, grandTotal, request.customerName(), request.fulfillment(),
                        request.notes(), deliveryQuote == null ? null : request.address(), deliveryQuote);
        return new CartQuote.Response(lines, unavailable, count, subtotal, discount, total, fee, grandTotal, deliveryQuote, text);
    }

}
