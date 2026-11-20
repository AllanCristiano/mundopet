package br.com.mundopet.beauty.internal;

import java.util.UUID;

import org.springframework.core.io.buffer.DataBufferLimitException;
import org.springframework.core.io.buffer.DataBufferUtils;
import org.springframework.http.HttpStatus;
import org.springframework.http.codec.multipart.FilePart;
import org.springframework.http.codec.multipart.FormFieldPart;
import org.springframework.http.codec.multipart.Part;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ServerWebExchange;

import br.com.mundopet.beauty.internal.BeautyTypes.NewTestimonial;
import br.com.mundopet.beauty.internal.BeautyTypes.Photo;
import br.com.mundopet.beauty.internal.BeautyTypes.PhotoForm;
import br.com.mundopet.beauty.internal.BeautyTypes.Testimonial;
import br.com.mundopet.shared.AdminGuard;
import jakarta.validation.Valid;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/**
 * Rotas da clinica (header X-Admin-Token). O token e conferido ANTES de ler o corpo do upload,
 * entao quem nao tem o token nao consegue nem fazer o servidor processar a imagem.
 */
@RestController
@RequestMapping("/api/beauty/admin")
class BeautyAdminController {

    private final BeautyService service;
    private final AdminGuard guard;

    BeautyAdminController(BeautyService service, AdminGuard guard) {
        this.service = service;
        this.guard = guard;
    }

    @GetMapping("/check")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    Mono<Void> check(@RequestHeader(value = AdminGuard.HEADER, required = false) String token) {
        return guard.check(token);
    }

    /** multipart/form-data: file (JPG/PNG), petName, species, service, caption. */
    @PostMapping("/photos")
    @ResponseStatus(HttpStatus.CREATED)
    Mono<Photo> upload(@RequestHeader(value = AdminGuard.HEADER, required = false) String token, ServerWebExchange exchange) {
        return guard.check(token)
                .then(exchange.getMultipartData())
                .flatMap(parts -> {
                    PhotoForm form = PhotoForm.of(field(parts, "petName"), field(parts, "species"), field(parts, "service"),
                            field(parts, "caption"));
                    if (!(parts.getFirst("file") instanceof FilePart file)) {
                        return Mono.error(new IllegalArgumentException("Envie a foto no campo 'file'"));
                    }
                    return DataBufferUtils.join(file.content(), ImageProcessor.MAX_BYTES)
                            .map(buffer -> {
                                byte[] bytes = new byte[buffer.readableByteCount()];
                                buffer.read(bytes);
                                DataBufferUtils.release(buffer);
                                return bytes;
                            })
                            .onErrorMap(DataBufferLimitException.class, ex -> new IllegalArgumentException("Foto muito grande (máximo 5 MB)"))
                            .defaultIfEmpty(new byte[0])
                            .flatMap(bytes -> service.addPhoto(bytes, form));
                });
    }

    static String field(MultiValueMap<String, Part> parts, String name) {
        return parts.getFirst(name) instanceof FormFieldPart f ? f.value() : null;
    }

    @DeleteMapping("/photos/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    Mono<Void> deletePhoto(@RequestHeader(value = AdminGuard.HEADER, required = false) String token, @PathVariable UUID id) {
        return guard.check(token).then(service.deletePhoto(id));
    }

    @GetMapping("/testimonials")
    Flux<Testimonial> pending(@RequestHeader(value = AdminGuard.HEADER, required = false) String token,
                              @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "48") int size) {
        return guard.check(token).thenMany(service.pending(page, size));
    }

    @PostMapping("/testimonials")
    @ResponseStatus(HttpStatus.CREATED)
    Mono<Testimonial> add(@RequestHeader(value = AdminGuard.HEADER, required = false) String token,
                          @Valid @RequestBody NewTestimonial body) {
        return guard.check(token).then(service.addApproved(body));
    }

    @PostMapping("/testimonials/{id}/approve")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    Mono<Void> approve(@RequestHeader(value = AdminGuard.HEADER, required = false) String token, @PathVariable UUID id) {
        return guard.check(token).then(service.approve(id));
    }

    @DeleteMapping("/testimonials/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    Mono<Void> deleteTestimonial(@RequestHeader(value = AdminGuard.HEADER, required = false) String token, @PathVariable UUID id) {
        return guard.check(token).then(service.deleteTestimonial(id));
    }
}
