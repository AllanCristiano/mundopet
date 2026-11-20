package br.com.mundopet.pets;

import java.time.Instant;
import java.util.Set;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import br.com.mundopet.files.StorageService;
import br.com.mundopet.files.StoredObject;
import br.com.mundopet.pets.internal.PetRepository;
import br.com.mundopet.queue.JobQueue;
import br.com.mundopet.shared.NotFoundException;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

@Service
public class PetService {

    public static final String PET_CREATED_JOB = "pet.created";
    static final Set<String> ALLOWED_PHOTO_TYPES = Set.of("image/jpeg", "image/png", "image/webp");
    static final int MAX_PAGE_SIZE = 100;

    private static final Logger log = LoggerFactory.getLogger(PetService.class);

    private final PetRepository repository;
    private final StorageService storage;
    private final JobQueue queue;

    public PetService(PetRepository repository, StorageService storage, JobQueue queue) {
        this.repository = repository;
        this.storage = storage;
        this.queue = queue;
    }

    /** Cria o pet e enfileira o evento. Falha na fila NAO desfaz o cadastro (degradacao controlada). */
    public Mono<Pet> create(CreatePetRequest req) {
        Pet pet = new Pet(null, req.name().trim(), req.species().trim(), req.breed(), req.birthDate(), null, Instant.now());
        return repository.save(pet)
                .flatMap(saved -> queue.enqueue(PET_CREATED_JOB, saved.id().toString())
                        .doOnError(ex -> log.warn("Pet {} criado mas evento nao enfileirado: {}", saved.id(), ex.toString()))
                        .onErrorResume(ex -> Mono.empty())
                        .thenReturn(saved));
    }

    public Flux<Pet> list(int page, int size) {
        if (page < 0 || size <= 0 || size > MAX_PAGE_SIZE) {
            return Flux.error(new IllegalArgumentException("Paginacao invalida (size entre 1 e " + MAX_PAGE_SIZE + ")"));
        }
        return repository.findAllByOrderByCreatedAtDesc(PageRequest.of(page, size));
    }

    public Mono<Pet> get(UUID id) {
        return repository.findById(id)
                .switchIfEmpty(Mono.error(() -> new NotFoundException("Pet nao encontrado: " + id)));
    }

    public Mono<Pet> attachPhoto(UUID id, byte[] data, String contentType) {
        if (contentType == null || !ALLOWED_PHOTO_TYPES.contains(contentType)) {
            return Mono.error(new IllegalArgumentException("Tipo de imagem nao suportado: " + contentType));
        }
        if (data.length == 0) {
            return Mono.error(new IllegalArgumentException("Arquivo vazio"));
        }
        return get(id).flatMap(pet -> storage.upload("pets/" + id + "/" + UUID.randomUUID(), data, contentType)
                .flatMap(key -> repository.save(pet.withPhotoKey(key))
                        .flatMap(saved -> pet.photoKey() == null ? Mono.just(saved)
                                : storage.delete(pet.photoKey()).onErrorResume(ex -> Mono.empty()).thenReturn(saved))));
    }

    public Mono<StoredObject> photo(UUID id) {
        return get(id).flatMap(pet -> pet.photoKey() == null
                ? Mono.error(new NotFoundException("Pet sem foto"))
                : storage.download(pet.photoKey()));
    }

    public Mono<Boolean> exists(UUID id) {
        return repository.existsById(id);
    }
}
