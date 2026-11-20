package br.com.mundopet.delivery;

import java.math.BigDecimal;

/**
 * Taxa de entrega para um CEP.
 *
 * @param status     OK = taxa calculada; OUT_OF_AREA = longe demais (nao entregamos);
 *                   UNKNOWN = nao deu para localizar o CEP agora (a loja combina a taxa)
 * @param distanceKm distancia estimada ate a loja (null se UNKNOWN)
 * @param fee        valor da entrega (so quando OK)
 * @param pricePerKm preco fixo por km configurado
 * @param maxKm      raio maximo de entrega
 */
public record DeliveryQuote(Status status, BigDecimal distanceKm, BigDecimal fee, BigDecimal pricePerKm, BigDecimal maxKm) {

    public enum Status {
        OK, OUT_OF_AREA, UNKNOWN
    }

    public boolean deliverable() {
        return status != Status.OUT_OF_AREA;
    }
}
