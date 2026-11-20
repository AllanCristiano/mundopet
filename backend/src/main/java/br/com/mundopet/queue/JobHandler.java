package br.com.mundopet.queue;

import reactor.core.publisher.Mono;

/** Implementado pelos outros modulos para processar um tipo de chamada da fila. Deve ser idempotente. */
public interface JobHandler {

    String type();

    Mono<Void> handle(Job job);
}
