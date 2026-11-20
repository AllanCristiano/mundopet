package br.com.mundopet.pets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import java.time.Duration;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.client.MultipartBodyBuilder;
import org.springframework.web.reactive.function.BodyInserters;

import br.com.mundopet.queue.JobQueue;
import br.com.mundopet.queue.JobState;
import br.com.mundopet.support.IntegrationTestBase;

/** Integracao ponta a ponta do modulo pets com Postgres, MinIO e Redis reais. */
class PetApiIT extends IntegrationTestBase {

    @Autowired
    JobQueue queue;

    private Pet createPet(String name) {
        return web.post().uri("/api/pets").contentType(MediaType.APPLICATION_JSON)
                .bodyValue(Map.of("name", name, "species", "gato"))
                .exchange()
                .expectStatus().isCreated()
                .expectBody(Pet.class).returnResult().getResponseBody();
    }

    @Test
    void createGetAndList() {
        Pet created = createPet("Mingau");
        assertThat(created.id()).isNotNull();

        web.get().uri("/api/pets/{id}", created.id()).exchange()
                .expectStatus().isOk()
                .expectBody().jsonPath("$.name").isEqualTo("Mingau");

        web.get().uri("/api/pets?size=100").exchange()
                .expectStatus().isOk()
                .expectBody().jsonPath("$[?(@.name == 'Mingau')]").exists();
    }

    @Test
    void invalidPayloadReturns400() {
        web.post().uri("/api/pets").contentType(MediaType.APPLICATION_JSON)
                .bodyValue(Map.of("name", "", "species", "gato"))
                .exchange()
                .expectStatus().isBadRequest()
                .expectBody().jsonPath("$.errors").isArray();
    }

    @Test
    void malformedJsonReturns400() {
        web.post().uri("/api/pets").contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{nao e json")
                .exchange()
                .expectStatus().isBadRequest();
    }

    @Test
    void unknownPetReturns404() {
        web.get().uri("/api/pets/{id}", UUID.randomUUID()).exchange().expectStatus().isNotFound();
    }

    @Test
    void invalidUuidReturns400() {
        web.get().uri("/api/pets/nao-e-uuid").exchange().expectStatus().isBadRequest();
    }

    @Test
    void abusivePageSizeReturns400() {
        web.get().uri("/api/pets?size=1000000").exchange().expectStatus().isBadRequest();
    }

    @Test
    void photoUploadAndDownloadRoundTrip() {
        Pet pet = createPet("Bolinha");
        byte[] png = {(byte) 0x89, 'P', 'N', 'G', 1, 2, 3};

        MultipartBodyBuilder body = new MultipartBodyBuilder();
        body.part("file", png).filename("foto.png").contentType(MediaType.IMAGE_PNG);

        web.put().uri("/api/pets/{id}/photo", pet.id())
                .contentType(MediaType.MULTIPART_FORM_DATA)
                .body(BodyInserters.fromMultipartData(body.build()))
                .exchange()
                .expectStatus().isOk()
                .expectBody().jsonPath("$.photoKey").isNotEmpty();

        byte[] downloaded = web.get().uri("/api/pets/{id}/photo", pet.id()).exchange()
                .expectStatus().isOk()
                .expectHeader().contentType(MediaType.IMAGE_PNG)
                .expectBody(byte[].class).returnResult().getResponseBody();
        assertThat(downloaded).isEqualTo(png);
    }

    @Test
    void photoWithForbiddenTypeReturns400() {
        Pet pet = createPet("Tom");
        MultipartBodyBuilder body = new MultipartBodyBuilder();
        body.part("file", new byte[]{1, 2}).filename("x.exe").contentType(MediaType.APPLICATION_OCTET_STREAM);

        web.put().uri("/api/pets/{id}/photo", pet.id())
                .contentType(MediaType.MULTIPART_FORM_DATA)
                .body(BodyInserters.fromMultipartData(body.build()))
                .exchange()
                .expectStatus().isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void petCreatedJobIsProcessedByQueue() {
        // O job e processado de forma assincrona: enfileira e espera o worker concluir
        Pet pet = createPet("Fila");
        String jobId = queue.enqueue(PetService.PET_CREATED_JOB, pet.id().toString()).block();

        await().atMost(Duration.ofSeconds(15)).untilAsserted(() ->
                assertThat(queue.status(jobId).block().state()).isEqualTo(JobState.DONE));
    }
}
