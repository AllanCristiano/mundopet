package br.com.mundopet.pets.internal;

import java.util.UUID;

import org.springframework.data.domain.Pageable;
import org.springframework.data.repository.reactive.ReactiveCrudRepository;

import br.com.mundopet.pets.Pet;
import reactor.core.publisher.Flux;

public interface PetRepository extends ReactiveCrudRepository<Pet, UUID> {

    Flux<Pet> findAllByOrderByCreatedAtDesc(Pageable pageable);
}
