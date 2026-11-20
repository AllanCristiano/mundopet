package br.com.mundopet.queue.internal;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.SmartLifecycle;
import org.springframework.data.redis.connection.ReactiveRedisConnectionFactory;
import org.springframework.data.redis.connection.stream.Consumer;
import org.springframework.data.redis.connection.stream.MapRecord;
import org.springframework.data.redis.connection.stream.ReadOffset;
import org.springframework.data.redis.connection.stream.StreamOffset;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.data.redis.stream.StreamReceiver;
import org.springframework.stereotype.Component;

import br.com.mundopet.queue.Job;
import br.com.mundopet.queue.JobHandler;
import br.com.mundopet.queue.JobState;
import br.com.mundopet.queue.QueueProperties;
import reactor.core.Disposable;
import reactor.core.publisher.Mono;
import reactor.util.retry.Retry;

/**
 * Consumidor da fila. Cada replica entra no mesmo consumer group com um nome unico (hostname do container),
 * entao o Redis distribui as mensagens entre as replicas. Falhas sao reenfileiradas ate maxAttempts e depois
 * vao para a dead letter stream.
 */
@Component
class JobWorker implements SmartLifecycle {

    private static final Logger log = LoggerFactory.getLogger(JobWorker.class);

    private final ReactiveStringRedisTemplate redis;
    private final StreamReceiver<String, MapRecord<String, String, String>> receiver;
    private final RedisJobQueue queue;
    private final QueueProperties props;
    private final Map<String, JobHandler> handlers;
    private final String consumerName;
    private volatile Disposable subscription;

    JobWorker(ReactiveStringRedisTemplate redis, ReactiveRedisConnectionFactory factory, RedisJobQueue queue,
              QueueProperties props, List<JobHandler> handlers) {
        this.redis = redis;
        this.queue = queue;
        this.props = props;
        this.handlers = handlers.stream().collect(Collectors.toMap(JobHandler::type, Function.identity()));
        this.consumerName = System.getenv().getOrDefault("HOSTNAME", "local") + "-" + ProcessHandle.current().pid();
        this.receiver = StreamReceiver.create(factory, StreamReceiver.StreamReceiverOptions.builder()
                .pollTimeout(Duration.ofSeconds(1))
                .batchSize(10)
                .build());
    }

    @Override
    public void start() {
        if (!props.workerEnabled()) {
            log.info("Worker da fila desabilitado");
            return;
        }
        subscription = createGroup()
                .thenMany(receiver.receive(Consumer.from(props.group(), consumerName),
                        StreamOffset.create(props.stream(), ReadOffset.lastConsumed())))
                .flatMap(this::process, props.concurrency())
                .retryWhen(Retry.backoff(Long.MAX_VALUE, Duration.ofSeconds(1)).maxBackoff(Duration.ofSeconds(30))
                        .doBeforeRetry(s -> log.warn("Reconectando worker da fila: {}", s.failure().toString())))
                .subscribe();
        log.info("Worker da fila iniciado como consumidor {}", consumerName);
    }

    Mono<Void> process(MapRecord<String, String, String> record) {
        Map<String, String> v = record.getValue();
        Job job = new Job(v.get("id"), v.get("type"), v.getOrDefault("payload", ""),
                Integer.parseInt(v.getOrDefault("attempts", "0")));
        JobHandler handler = handlers.get(job.type());

        Mono<Void> work = handler == null
                ? queue.saveState(job, JobState.FAILED, "Sem handler para " + job.type())
                : queue.saveState(job, JobState.RUNNING, null)
                        .then(Mono.defer(() -> handler.handle(job)).timeout(props.jobTimeout()))
                        .then(queue.saveState(job, JobState.DONE, null))
                        .onErrorResume(ex -> retryOrFail(job, ex));

        return work
                .then(redis.opsForStream().acknowledge(props.stream(), props.group(), record.getId()))
                .then()
                .onErrorResume(ex -> {
                    log.error("Erro ao processar job {}", job.id(), ex);
                    return Mono.empty();
                });
    }

    private Mono<Void> retryOrFail(Job job, Throwable ex) {
        Job next = new Job(job.id(), job.type(), job.payload(), job.attempts() + 1);
        String error = ex.getClass().getSimpleName() + ": " + ex.getMessage();
        if (next.attempts() < props.maxAttempts()) {
            log.warn("Job {} falhou (tentativa {}), reenfileirando", job.id(), next.attempts());
            return queue.saveState(next, JobState.QUEUED, error).then(queue.push(props.stream(), next));
        }
        log.error("Job {} falhou definitivamente, enviando para DLQ", job.id());
        return queue.saveState(next, JobState.FAILED, error).then(queue.push(props.deadLetterStream(), next));
    }

    private Mono<Void> createGroup() {
        ByteBuffer key = ByteBuffer.wrap(props.stream().getBytes(StandardCharsets.UTF_8));
        return redis.execute(conn -> conn.streamCommands().xGroupCreate(key, props.group(), ReadOffset.from("0"), true))
                .then()
                .onErrorResume(JobWorker::isBusyGroup, ex -> Mono.empty());
    }

    static boolean isBusyGroup(Throwable ex) {
        for (Throwable t = ex; t != null; t = t.getCause()) {
            if (t.getMessage() != null && t.getMessage().contains("BUSYGROUP")) {
                return true;
            }
        }
        return false;
    }

    @Override
    public void stop() {
        if (subscription != null) {
            subscription.dispose();
        }
    }

    @Override
    public boolean isRunning() {
        return subscription != null && !subscription.isDisposed();
    }
}
