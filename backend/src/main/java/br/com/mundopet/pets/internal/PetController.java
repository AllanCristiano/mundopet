package br.com.mundopet.pets.internal;

import java.util.UUID;

import org.springframework.core.io.buffer.DataBufferUtils;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.codec.multipart.FilePart;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import br.com.mundopet.pets.CreatePetRequest;
import br.com.mundopet.pets.Pet;
import br.com.mundopet.pets.PetService;
import jakarta.validation.Valid;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

@RestController
@RequestMapping("/api/pets")
class PetController {

    private final PetService service;

    PetController(PetService service) {
        this.service = service;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    Mono<Pet> create(@Valid @RequestBody CreatePetRequest req) {
        return service.create(req);
    }

    @GetMapping
    Flux<Pet> list(@RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return service.list(page, size);
    }

    @GetMapping("/{id}")
    Mono<Pet> get(@PathVariable UUID id) {
        return service.get(id);
    }

    @PutMapping(path = "/{id}/photo", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    Mono<Pet> uploadPhoto(@PathVariable UUID id, @RequestPart("file") FilePart file) {
        String contentType = file.headers().getContentType() == null ? null : file.headers().getContentType().toString();
        return DataBufferUtils.join(file.content())
                .map(buffer -> {
                    byte[] bytes = new byte[buffer.readableByteCount()];
                    buffer.read(bytes);
                    DataBufferUtils.release(buffer);
                    return bytes;
                })
                .defaultIfEmpty(new byte[0])
                .flatMap(bytes -> service.attachPhoto(id, bytes, contentType));
    }

    @GetMapping("/{id}/photo")
    Mono<ResponseEntity<byte[]>> photo(@PathVariable UUID id) {
        return service.photo(id).map(obj -> ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(obj.contentType()))
                .body(obj.data()));
    }
}
