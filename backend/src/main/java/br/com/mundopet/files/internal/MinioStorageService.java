package br.com.mundopet.files.internal;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.time.Duration;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;

import br.com.mundopet.files.MinioProperties;
import br.com.mundopet.files.StorageService;
import br.com.mundopet.files.StoredObject;
import br.com.mundopet.shared.DependencyUnavailableException;
import br.com.mundopet.shared.NotFoundException;
import io.minio.BucketExistsArgs;
import io.minio.GetObjectArgs;
import io.minio.MakeBucketArgs;
import io.minio.MinioAsyncClient;
import io.minio.PutObjectArgs;
import io.minio.RemoveObjectArgs;
import io.minio.errors.ErrorResponseException;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;
import reactor.util.retry.Retry;

@Service
class MinioStorageService implements StorageService {

    private static final Logger log = LoggerFactory.getLogger(MinioStorageService.class);
    private static final Duration TIMEOUT = Duration.ofSeconds(10);

    @FunctionalInterface
    interface MinioCall<T> {
        CompletableFuture<T> call() throws Exception;
    }

    private final MinioAsyncClient client;
    private final String bucket;

    MinioStorageService(MinioAsyncClient client, MinioProperties props) {
        this.client = client;
        this.bucket = props.bucket();
    }

    @EventListener(ApplicationReadyEvent.class)
    void ensureBucket() {
        async(() -> client.bucketExists(BucketExistsArgs.builder().bucket(bucket).build()))
                .flatMap(exists -> exists ? Mono.<Void>empty()
                        : async(() -> client.makeBucket(MakeBucketArgs.builder().bucket(bucket).build())).then())
                .retryWhen(Retry.backoff(10, Duration.ofSeconds(1)))
                .subscribe(v -> { }, ex -> log.error("Nao foi possivel criar o bucket {}", bucket, ex),
                        () -> log.info("Bucket {} pronto", bucket));
    }

    @Override
    public Mono<String> upload(String key, byte[] data, String contentType) {
        return async(() -> client.putObject(PutObjectArgs.builder()
                        .bucket(bucket).object(key).contentType(contentType)
                        .stream(new ByteArrayInputStream(data), data.length, -1)
                        .build()))
                .thenReturn(key);
    }

    @Override
    public Mono<StoredObject> download(String key) {
        return async(() -> client.getObject(GetObjectArgs.builder().bucket(bucket).object(key).build()))
                .publishOn(Schedulers.boundedElastic())
                .map(resp -> {
                    try (InputStream in = resp) {
                        String type = resp.headers().get("Content-Type");
                        return new StoredObject(in.readAllBytes(), type == null ? "application/octet-stream" : type);
                    } catch (Exception e) {
                        throw new DependencyUnavailableException("MinIO", e);
                    }
                });
    }

    @Override
    public Mono<Void> delete(String key) {
        return async(() -> client.removeObject(RemoveObjectArgs.builder().bucket(bucket).object(key).build()));
    }

    /** Converte chamadas assincronas do MinIO em Mono, traduzindo erros para excecoes do dominio. */
    static <T> Mono<T> async(MinioCall<T> call) {
        return Mono.defer(() -> {
                    try {
                        return Mono.fromFuture(call.call());
                    } catch (Exception e) {
                        return Mono.error(e);
                    }
                })
                .timeout(TIMEOUT)
                .onErrorMap(MinioStorageService::translate);
    }

    static Throwable translate(Throwable ex) {
        Throwable cause = ex instanceof CompletionException && ex.getCause() != null ? ex.getCause() : ex;
        if (cause instanceof ErrorResponseException ere
                && ("NoSuchKey".equals(ere.errorResponse().code()) || "NoSuchObject".equals(ere.errorResponse().code()))) {
            return new NotFoundException("Arquivo nao encontrado");
        }
        if (cause instanceof NotFoundException || cause instanceof DependencyUnavailableException) {
            return cause;
        }
        return new DependencyUnavailableException("MinIO", cause);
    }
}
