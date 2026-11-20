package br.com.mundopet.pets;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;

import br.com.mundopet.files.StorageService;
import br.com.mundopet.pets.internal.PetRepository;
import br.com.mundopet.queue.JobQueue;
import br.com.mundopet.shared.DependencyUnavailableException;
import br.com.mundopet.shared.NotFoundException;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

/** Testes de falha do modulo pets (dependencias simuladas falhando). */
class PetServiceTest {

    private PetRepository repo;
    private StorageService storage;
    private JobQueue queue;
    private PetService service;

    private final UUID id = UUID.randomUUID();
    private final Pet pet = new Pet(id, "Rex", "cachorro", null, null, null, Instant.now());

    @BeforeEach
    void setUp() {
        repo = mock(PetRepository.class);
        storage = mock(StorageService.class);
        queue = mock(JobQueue.class);
        service = new PetService(repo, storage, queue);
    }

    @Test
    void createSucceedsEvenWhenQueueIsDown() {
        when(repo.save(any())).thenReturn(Mono.just(pet));
        when(queue.enqueue(anyString(), anyString()))
                .thenReturn(Mono.error(new DependencyUnavailableException("Redis", new RuntimeException())));

        StepVerifier.create(service.create(new CreatePetRequest(" Rex ", "cachorro", null, null)))
                .expectNext(pet)
                .verifyComplete();
    }

    @Test
    void createPropagatesDatabaseFailure() {
        when(repo.save(any())).thenReturn(Mono.error(new DataAccessResourceFailureException("db down")));

        StepVerifier.create(service.create(new CreatePetRequest("Rex", "cachorro", null, null)))
                .expectError(DataAccessResourceFailureException.class)
                .verify();
        verify(queue, never()).enqueue(anyString(), anyString());
    }

    @Test
    void getUnknownPetIsNotFound() {
        when(repo.findById(id)).thenReturn(Mono.empty());
        StepVerifier.create(service.get(id)).expectError(NotFoundException.class).verify();
    }

    @Test
    void listRejectsAbusivePageSize() {
        StepVerifier.create(service.list(0, 10_000)).expectError(IllegalArgumentException.class).verify();
        StepVerifier.create(service.list(-1, 10)).expectError(IllegalArgumentException.class).verify();
    }

    @Test
    void attachPhotoRejectsInvalidInput() {
        StepVerifier.create(service.attachPhoto(id, new byte[]{1}, "application/x-msdownload"))
                .expectError(IllegalArgumentException.class).verify();
        StepVerifier.create(service.attachPhoto(id, new byte[0], "image/png"))
                .expectError(IllegalArgumentException.class).verify();
    }

    @Test
    void attachPhotoFailsWhenStorageIsDownAndDoesNotTouchDatabase() {
        when(repo.findById(id)).thenReturn(Mono.just(pet));
        when(storage.upload(anyString(), any(), eq("image/png")))
                .thenReturn(Mono.error(new DependencyUnavailableException("MinIO", new RuntimeException())));

        StepVerifier.create(service.attachPhoto(id, new byte[]{1, 2}, "image/png"))
                .expectError(DependencyUnavailableException.class).verify();
        verify(repo, never()).save(any());
    }

    @Test
    void photoOfPetWithoutPhotoIsNotFound() {
        when(repo.findById(id)).thenReturn(Mono.just(pet));
        StepVerifier.create(service.photo(id)).expectError(NotFoundException.class).verify();
    }

    @Test
    void replacingPhotoIgnoresFailureDeletingOldOne() {
        Pet withPhoto = pet.withPhotoKey("old");
        when(repo.findById(id)).thenReturn(Mono.just(withPhoto));
        when(storage.upload(anyString(), any(), anyString())).thenReturn(Mono.just("new"));
        when(repo.save(any())).thenAnswer(inv -> Mono.just(inv.getArgument(0)));
        when(storage.delete("old")).thenReturn(Mono.error(new RuntimeException("minio")));

        StepVerifier.create(service.attachPhoto(id, new byte[]{1}, "image/png"))
                .expectNextMatches(p -> "new".equals(p.photoKey()))
                .verifyComplete();
    }
}
