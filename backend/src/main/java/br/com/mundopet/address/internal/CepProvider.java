package br.com.mundopet.address.internal;

import br.com.mundopet.address.Address;
import reactor.core.publisher.Mono;

/**
 * Uma fonte de CEP.
 * Contrato: Mono com o endereco = encontrado; Mono vazio = CEP nao existe nesta fonte; erro = fonte indisponivel.
 */
interface CepProvider {

    String name();

    Mono<Address> find(String cepDigits);
}
