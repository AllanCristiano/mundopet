package br.com.mundopet.queue.internal;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.redis.connection.stream.StreamRecords;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.stereotype.Service;

import br.com.mundopet.queue.Job;
import br.com.mundopet.queue.JobHandler;
import br.com.mundopet.queue.JobQueue;
import br.com.mundopet.queue.JobState;
import br.com.mundopet.queue.JobStatus;
import br.com.mundopet.queue.QueueProperties;
import br.com.mundopet.shared.DependencyUnavailableException;
import reactor.core.publisher.Mono;

@Service
class RedisJobQueue implements JobQueue {

    private final ReactiveStringRedisTemplate redis;
    private final QueueProperties props;
    private final ObjectProvider<JobHandler> handlers;
    private volatile Set<String> knownTypes;

    /** ObjectProvider evita ciclo: handlers dependem de servicos que dependem da fila. */
    RedisJobQueue(ReactiveStringRedisTemplate redis, QueueProperties props, ObjectProvider<JobHandler> handlers) {
        this.redis = redis;
        this.props = props;
        this.handlers = handlers;
    }

    @Override
    public boolean supports(String type) {
        if (knownTypes == null) {
            knownTypes = handlers.stream().map(JobHandler::type).collect(Collectors.toUnmodifiableSet());
        }
        return knownTypes.contains(type);
    }

    @Override
    public Mono<String> enqueue(String type, String payload) {
        if (!supports(type)) {
            return Mono.error(new IllegalArgumentException("Tipo de job desconhecido: " + type));
        }
        Job job = new Job(UUID.randomUUID().toString(), type, payload == null ? "" : payload, 0);
        return saveState(job, JobState.QUEUED, null)
                .then(Mono.defer(() -> push(props.stream(), job)))
                .thenReturn(job.id())
                .onErrorMap(ex -> new DependencyUnavailableException("Redis", ex));
    }

    @Override
    public Mono<JobStatus> status(String jobId) {
        return redis.<String, String>opsForHash().entries(key(jobId))
                .collectMap(Map.Entry::getKey, Map.Entry::getValue)
                .onErrorMap(ex -> new DependencyUnavailableException("Redis", ex))
                .filter(m -> !m.isEmpty())
                .map(m -> new JobStatus(jobId, m.get("type"), JobState.valueOf(m.get("state")),
                        Integer.parseInt(m.getOrDefault("attempts", "0")), m.get("error"), m.get("updatedAt")));
    }

    Mono<Void> push(String stream, Job job) {
        var record = StreamRecords.string(Map.of(
                "id", job.id(), "type", job.type(), "payload", job.payload(),
                "attempts", String.valueOf(job.attempts()))).withStreamKey(stream);
        return redis.opsForStream().add(record).then();
    }

    Mono<Void> saveState(Job job, JobState state, String error) {
        String key = key(job.id());
        Map<String, String> fields = new HashMap<>(Map.of(
                "type", job.type(), "state", state.name(),
                "attempts", String.valueOf(job.attempts()), "updatedAt", Instant.now().toString()));
        if (error != null) {
            fields.put("error", error);
        }
        return redis.<String, String>opsForHash().putAll(key, fields)
                .then(Mono.defer(() -> redis.expire(key, props.statusTtl())))
                .then();
    }

    static String key(String jobId) {
        return "job:" + jobId;
    }
}
