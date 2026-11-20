package br.com.mundopet.catalog.internal;

import java.math.BigDecimal;
import java.text.NumberFormat;
import java.util.List;
import java.util.Locale;

import org.springframework.stereotype.Component;

import br.com.mundopet.catalog.internal.CatalogEnums.Fulfillment;

/**
 * Monta o pedido como uma mensagem de WhatsApp com cara de "catalogo de compra".
 * Usa a formatacao nativa do WhatsApp: *negrito*, _italico_, ~tachado~.
 */
@Component
class WhatsAppMessageFormatter {

    static final String DIVIDER = "━━━━━━━━━━━━━━━━━━";
    private static final Locale PT_BR = Locale.of("pt", "BR");

    String format(List<CartQuote.Line> lines, int itemsCount, BigDecimal subtotal, BigDecimal discount,
                  BigDecimal total, String customerName, Fulfillment fulfillment, String notes) {
        StringBuilder sb = new StringBuilder();
        sb.append("🐾 *MUNDOPET · PEDIDO DE RAÇÕES*\n");
        String name = clean(customerName);
        sb.append(name.isEmpty() ? "Olá! Gostaria de fazer este pedido:\n" : "Olá! Sou *" + name + "* e gostaria de fazer este pedido:\n");
        sb.append(DIVIDER).append('\n');

        for (int i = 0; i < lines.size(); i++) {
            CartQuote.Line l = lines.get(i);
            sb.append('\n').append(number(i + 1)).append(" *").append(l.name()).append("*\n");
            sb.append("     ").append(l.brand()).append(" · ").append(kg(l.weightKg())).append(" · cód. ").append(l.sku()).append('\n');
            sb.append("     ").append(l.quantity()).append(" un × ");
            if (l.promo()) {
                sb.append('~').append(money(l.originalUnitPrice())).append("~ ").append(money(l.unitPrice())).append(" 🔥");
            } else {
                sb.append(money(l.unitPrice()));
            }
            sb.append('\n');
            sb.append("     Subtotal: *").append(money(l.lineTotal())).append("*\n");
            if (l.warning() != null) {
                sb.append("     ⚠️ _").append(l.warning()).append("_\n");
            }
        }

        sb.append('\n').append(DIVIDER).append('\n');
        sb.append("🛒 Itens: ").append(itemsCount).append('\n');
        if (discount.signum() > 0) {
            sb.append("💰 Subtotal: ").append(money(subtotal)).append('\n');
            sb.append("🏷️ Descontos: -").append(money(discount)).append('\n');
        }
        sb.append("✅ *TOTAL: ").append(money(total)).append("*\n");
        sb.append(DIVIDER).append('\n');

        sb.append(fulfillment == Fulfillment.DELIVERY ? "🛵 *Entrega* (vou enviar o endereço)\n" : "🏬 *Retirada na loja*\n");
        String obs = notes == null ? "" : notes.strip();
        if (!obs.isEmpty()) {
            sb.append("📝 Obs.: ").append(obs).append('\n');
        }
        sb.append('\n').append("_Pedido montado pelo site. Valores e estoque sujeitos à confirmação da loja._");
        return sb.toString();
    }

    static String money(BigDecimal value) {
        // o formato pt-BR usa espaco nao separavel; troca por espaco normal para o WhatsApp
        return NumberFormat.getCurrencyInstance(PT_BR).format(value).replace(' ', ' ');
    }

    static String kg(BigDecimal weight) {
        NumberFormat nf = NumberFormat.getNumberInstance(PT_BR);
        nf.setMaximumFractionDigits(2);
        return nf.format(weight) + " kg";
    }

    /** Numeros com emoji de teclado (1️⃣ 2️⃣ ...) ate 9; depois, numero simples. */
    static String number(int n) {
        return n <= 9 ? n + "️⃣" : n + ".";
    }

    /** Nome vai em negrito numa linha: remove quebras e marcadores de formatacao. */
    static String clean(String value) {
        return value == null ? "" : value.replaceAll("[\\r\\n*_~`]", " ").replaceAll("\\s+", " ").strip();
    }
}
