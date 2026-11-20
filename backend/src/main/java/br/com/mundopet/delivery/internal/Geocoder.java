package br.com.mundopet.delivery.internal;

import reactor.core.publisher.Mono;

/**
 * Uma fonte de coordenadas por CEP.
 * Contrato: Mono com o ponto = encontrado; vazio = esta fonte nao sabe; erro = fonte indisponivel.
 */
interface Geocoder {

    String name();

    Mono<GeoPoint> locate(String cepDigits);
}
