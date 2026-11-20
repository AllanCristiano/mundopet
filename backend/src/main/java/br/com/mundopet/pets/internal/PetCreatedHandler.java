package br.com.mundopet.pets.internal;

import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import br.com.mundopet.pets.PetService;
import br.com.mundopet.queue.Job;
import br.com.mundopet.queue.JobHandler;
import br.com.mundopet.shared.NotFoundException;
import reactor.core.publisher.Mono;

/** Processa o evento de pet criado fora da requisicao HTTP (ex.: notificacao de boas-vindas). */
@Component
class PetCreatedHandler implements JobHandler {

    private static final Logger log = LoggerFactory.getLogger(PetCreatedHandler.class);

    private final PetService pets;

    PetCreatedHandler(PetService pets) {
        this.pets = pets;
    }

    @Override
    public String type() {
        return PetService.PET_CREATED_JOB;
    }

    @Override
    public Mono<Void> handle(Job job) {
        UUID id = UUID.fromString(job.payload());
        return pets.exists(id)
                .flatMap(exists -> exists
                        ? Mono.<Void>fromRunnable(() -> log.info("Boas-vindas enviadas para o pet {}", id))
                        : Mono.error(new NotFoundException("Pet " + id + " nao existe")));
    }
}
