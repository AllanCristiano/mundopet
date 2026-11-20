package br.com.mundopet.shared;

/** Lancada quando uma dependencia externa (MinIO, Redis, Postgres) esta indisponivel. Vira HTTP 503. */
public class DependencyUnavailableException extends RuntimeException {
    public DependencyUnavailableException(String dependency, Throwable cause) {
        super(dependency + " indisponivel", cause);
    }
}
