/**
 * Modulo de entrega: taxa por distancia da loja (preco fixo por km, com raio maximo).
 * Localiza o CEP (AwesomeAPI com BrasilAPI de reserva, cache no Redis) e calcula a distancia ate a loja.
 * API publica: {@link br.com.mundopet.delivery.DeliveryCalculator} e {@link br.com.mundopet.delivery.DeliveryQuote}.
 */
@org.springframework.modulith.ApplicationModule(displayName = "Entrega")
package br.com.mundopet.delivery;
