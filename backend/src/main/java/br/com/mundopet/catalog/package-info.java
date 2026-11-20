/**
 * Modulo de catalogo: racoes com busca, filtros, promocoes e orcamento do carrinho
 * (o servidor recalcula precos e monta a mensagem do pedido para o WhatsApp).
 * Nao expoe API para outros modulos; tudo fica em {@code internal}.
 */
@org.springframework.modulith.ApplicationModule(displayName = "Catalogo")
package br.com.mundopet.catalog;
