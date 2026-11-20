package br.com.mundopet.queue;

import reactor.core.publisher.Mono;

public interface JobQueue {

    /** Enfileira uma chamada e devolve o id do job. */
    Mono<String> enqueue(String type, String payload);

    Mono<JobStatus> status(String jobId);

    boolean supports(String type);
}
