package br.com.mundopet.queue;

public record Job(String id, String type, String payload, int attempts) {
}
