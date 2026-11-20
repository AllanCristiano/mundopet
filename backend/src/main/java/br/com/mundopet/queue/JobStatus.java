package br.com.mundopet.queue;

public record JobStatus(String id, String type, JobState state, int attempts, String error, String updatedAt) {
}
