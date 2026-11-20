package br.com.mundopet.delivery.internal;

import java.math.BigDecimal;
import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Configuracao da taxa de entrega.
 *
 * @param storeLat/storeLng coordenadas da loja
 * @param pricePerKm        preco fixo por km (R$)
 * @param maxKm             raio maximo de entrega; acima disso o pedido de entrega e recusado
 * @param roadFactor        a distancia e em linha reta; multiplicamos por este fator para aproximar o caminho pelas ruas
 */
@ConfigurationProperties("mundopet.delivery")
record DeliveryProperties(Double storeLat, Double storeLng, BigDecimal pricePerKm, BigDecimal maxKm, Double roadFactor,
                          String awesomeapiUrl, String brasilapiUrl, Duration timeout, Duration cacheTtl) {

    DeliveryProperties {
        if (storeLat == null) storeLat = -23.5505;
        if (storeLng == null) storeLng = -46.6333;
        if (pricePerKm == null) pricePerKm = new BigDecimal("2.00");
        if (maxKm == null) maxKm = new BigDecimal("15");
        if (roadFactor == null) roadFactor = 1.3;
        if (awesomeapiUrl == null) awesomeapiUrl = "https://cep.awesomeapi.com.br/json";
        if (brasilapiUrl == null) brasilapiUrl = "https://brasilapi.com.br/api/cep/v2";
        if (timeout == null) timeout = Duration.ofSeconds(3);
        if (cacheTtl == null) cacheTtl = Duration.ofDays(30);
        if (!GeoPoint.isValid(storeLat, storeLng)) {
            throw new IllegalArgumentException("mundopet.delivery.store-lat/lng invalidos: " + storeLat + "," + storeLng);
        }
        if (pricePerKm.signum() < 0 || maxKm.signum() <= 0 || roadFactor < 1) {
            throw new IllegalArgumentException("mundopet.delivery: price-per-km >= 0, max-km > 0 e road-factor >= 1");
        }
    }

    GeoPoint store() {
        return new GeoPoint(storeLat, storeLng);
    }
}
