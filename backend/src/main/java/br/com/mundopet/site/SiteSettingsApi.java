package br.com.mundopet.site;

import java.math.BigDecimal;

import reactor.core.publisher.Mono;

/** O que outros modulos podem ler das configuracoes do site. */
public interface SiteSettingsApi {

    /** Local da loja e precos de entrega definidos pelo dono. Vazio se ele ainda nao salvou a gestao. */
    Mono<StoreDelivery> delivery();

    record StoreDelivery(double lat, double lng, BigDecimal pricePerKm, BigDecimal maxKm) {
    }
}
