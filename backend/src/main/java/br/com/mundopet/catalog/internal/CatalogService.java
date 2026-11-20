package br.com.mundopet.catalog.internal;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;

import org.springframework.stereotype.Service;

import br.com.mundopet.shared.NotFoundException;
import reactor.core.publisher.Mono;

@Service
class CatalogService {

    private final ProductRepository repository;
    private final WhatsAppMessageFormatter formatter;

    CatalogService(ProductRepository repository, WhatsAppMessageFormatter formatter) {
        this.repository = repository;
        this.formatter = formatter;
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
        Map<UUID, Integer> quantities = new LinkedHashMap<>();
        for (CartQuote.Item item : request.items()) {
            int merged = quantities.merge(item.productId(), item.quantity(), Integer::sum);
            if (merged > CartQuote.MAX_QUANTITY) {
                return Mono.error(new IllegalArgumentException("Quantidade máxima por produto: " + CartQuote.MAX_QUANTITY));
            }
        }

        return repository.findByIds(quantities.keySet())
                .collectMap(Product::id, Function.identity())
                .map(products -> build(request, quantities, products));
    }

    private CartQuote.Response build(CartQuote.Request request, Map<UUID, Integer> quantities, Map<UUID, Product> products) {
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
        String text = lines.isEmpty() ? null
                : formatter.format(lines, count, subtotal, discount, total, request.customerName(), request.fulfillment(),
                        request.notes());
        return new CartQuote.Response(lines, unavailable, count, subtotal, discount, total, text);
    }

}
