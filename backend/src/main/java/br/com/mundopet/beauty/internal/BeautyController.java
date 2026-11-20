package br.com.mundopet.beauty.internal;

import java.time.Duration;
import java.util.UUID;

import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ServerWebExchange;

import br.com.mundopet.beauty.internal.BeautyTypes.NewTestimonial;
import br.com.mundopet.beauty.internal.BeautyTypes.PhotoPage;
import br.com.mundopet.beauty.internal.BeautyTypes.Testimonial;
import br.com.mundopet.beauty.internal.BeautyTypes.TestimonialPage;
import br.com.mundopet.shared.RateLimitFilter;
import jakarta.validation.Valid;
import reactor.core.publisher.Mono;

/** Rotas publicas do Espaco Beleza. */
@RestController
@RequestMapping("/api/beauty")
class BeautyController {

    private final BeautyService service;

    BeautyController(BeautyService service) {
        this.service = service;
    }

    /** Listas sem cache: a clinica publica/aprova e ve na hora (as IMAGENS e que ficam em cache). */
    @GetMapping("/photos")
    Mono<ResponseEntity<PhotoPage>> photos(@RequestParam(required = false) String service,
                                           @RequestParam(defaultValue = "0") int page,
                                           @RequestParam(defaultValue = "24") int size) {
        return this.service.photos(service, page, size).map(p -> ResponseEntity.ok()
                .cacheControl(CacheControl.noCache()).body(p));
    }

    /** Imagem servida pela API (o MinIO nunca fica exposto). Nao muda depois de enviada: cache de 1 dia. */
    @GetMapping("/photos/{id}/{variant}")
    Mono<ResponseEntity<byte[]>> image(@PathVariable UUID id, @PathVariable String variant) {
        return service.image(id, variant).map(obj -> ResponseEntity.ok()
                .contentType(MediaType.IMAGE_JPEG)
                .cacheControl(CacheControl.maxAge(Duration.ofDays(1)).cachePublic())
                .body(obj.data()));
    }

    @GetMapping("/testimonials")
    Mono<ResponseEntity<TestimonialPage>> testimonials(@RequestParam(defaultValue = "0") int page,
                                                       @RequestParam(defaultValue = "12") int size) {
        return service.testimonials(page, size).map(p -> ResponseEntity.ok()
                .cacheControl(CacheControl.noCache()).body(p));
    }

    record Submitted(String status, String message) {
    }

    @PostMapping("/testimonials")
    @ResponseStatus(HttpStatus.ACCEPTED)
    Mono<Submitted> submit(@Valid @RequestBody NewTestimonial body, ServerWebExchange exchange) {
        return service.submit(body, RateLimitFilter.clientIp(exchange))
                .map((Testimonial t) -> new Submitted("PENDING", "Obrigado! Seu depoimento aparece no site depois que a equipe aprovar."));
    }
}
