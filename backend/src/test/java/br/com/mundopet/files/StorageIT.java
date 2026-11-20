package br.com.mundopet.files;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import br.com.mundopet.shared.NotFoundException;
import br.com.mundopet.support.IntegrationTestBase;
import reactor.test.StepVerifier;

/** Integracao do modulo files com MinIO real. */
class StorageIT extends IntegrationTestBase {

    @Autowired
    StorageService storage;

    @Test
    void uploadDownloadDelete() {
        byte[] data = "conteudo".getBytes(StandardCharsets.UTF_8);

        StepVerifier.create(storage.upload("it/a.txt", data, "text/plain")).expectNext("it/a.txt").verifyComplete();

        StepVerifier.create(storage.download("it/a.txt"))
                .assertNext(obj -> {
                    assertThat(obj.data()).isEqualTo(data);
                    assertThat(obj.contentType()).isEqualTo("text/plain");
                })
                .verifyComplete();

        StepVerifier.create(storage.delete("it/a.txt")).verifyComplete();
        StepVerifier.create(storage.download("it/a.txt")).expectError(NotFoundException.class).verify();
    }

    @Test
    void missingObjectIsNotFound() {
        StepVerifier.create(storage.download("nao/existe")).expectError(NotFoundException.class).verify();
    }
}
