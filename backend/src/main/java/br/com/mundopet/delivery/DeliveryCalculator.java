package br.com.mundopet.delivery;

import reactor.core.publisher.Mono;

/** Calcula a taxa de entrega por distancia. Nunca falha: se nao localizar o CEP, devolve status UNKNOWN. */
public interface DeliveryCalculator {

    Mono<DeliveryQuote> quote(String cep);
}
