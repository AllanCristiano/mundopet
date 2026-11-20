package br.com.mundopet.files.internal;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;

import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;

import br.com.mundopet.files.MinioProperties;
import br.com.mundopet.shared.DependencyUnavailableException;
import br.com.mundopet.shared.NotFoundException;
import reactor.test.StepVerifier;

/** Testes de falha do modulo files: MinIO inacessivel e traducao de erros. */
class MinioStorageServiceTest {

    @Test
    void unreachableMinioIsDependencyUnavailable() {
        // Porta 1 sem servico: conexao recusada
        MinioProperties props = new MinioProperties("http://127.0.0.1:1", "a", "b", "bucket");
        var service = new MinioStorageService(new MinioConfig().minioAsyncClient(props), props);

        StepVerifier.create(service.upload("k", new byte[]{1}, "image/png"))
                .expectError(DependencyUnavailableException.class).verify();
        StepVerifier.create(service.download("k"))
                .expectError(DependencyUnavailableException.class).verify();
        StepVerifier.create(service.delete("k"))
                .expectError(DependencyUnavailableException.class).verify();
    }

    @Test
    void synchronousExceptionFromClientIsTranslated() {
        StepVerifier.create(MinioStorageService.async(() -> { throw new IllegalStateException("x"); }))
                .expectError(DependencyUnavailableException.class).verify();
    }

    @Test
    void translateKeepsDomainExceptions() {
        var nf = new NotFoundException("x");
        Assertions.assertThat(MinioStorageService.translate(new CompletionException(nf))).isSameAs(nf);
        Assertions.assertThat(MinioStorageService.translate(new RuntimeException()))
                .isInstanceOf(DependencyUnavailableException.class);
    }

    @Test
    void failedFutureIsTranslated() {
        StepVerifier.create(MinioStorageService.async(() -> CompletableFuture.failedFuture(new RuntimeException("io"))))
                .expectError(DependencyUnavailableException.class).verify();
    }
}
