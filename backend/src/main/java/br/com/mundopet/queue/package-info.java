/**
 * Modulo de fila: chamadas assincronas via Redis Streams com consumer group.
 * Cada replica da API e um consumidor do mesmo grupo, entao o trabalho e dividido entre as (ate 6) replicas.
 * API publica: {@link br.com.mundopet.queue.JobQueue}, {@link br.com.mundopet.queue.JobHandler}.
 */
@org.springframework.modulith.ApplicationModule(displayName = "Fila")
package br.com.mundopet.queue;
