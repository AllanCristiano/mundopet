package br.com.mundopet.beauty.internal;

import java.util.List;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import br.com.mundopet.beauty.internal.BeautyTypes.NewTestimonial;
import br.com.mundopet.beauty.internal.BeautyTypes.Photo;
import br.com.mundopet.beauty.internal.BeautyTypes.PhotoForm;
import br.com.mundopet.beauty.internal.BeautyTypes.PhotoPage;
import br.com.mundopet.beauty.internal.BeautyTypes.Status;
import br.com.mundopet.beauty.internal.BeautyTypes.Testimonial;
import br.com.mundopet.beauty.internal.BeautyTypes.TestimonialPage;
import br.com.mundopet.beauty.internal.BeautyTypes.Variant;
import br.com.mundopet.files.StorageService;
import br.com.mundopet.files.StoredObject;
import br.com.mundopet.shared.NotFoundException;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

@Service
class BeautyService {

    static final int MAX_PAGE_SIZE = 48;
    static final int MAX_PAGE = 500;

    private static final Logger log = LoggerFactory.getLogger(BeautyService.class);

    private final BeautyRepository repository;
    private final StorageService storage;
    private final ImageProcessor images;
    private final TestimonialThrottle throttle;

    BeautyService(BeautyRepository repository, StorageService storage, ImageProcessor images, TestimonialThrottle throttle) {
        this.repository = repository;
        this.storage = storage;
        this.images = images;
        this.throttle = throttle;
    }

    // ---------------- Galeria ----------------

    Mono<PhotoPage> photos(String service, int page, int size) {
        return Mono.defer(() -> {
            int s = clampSize(size);
            int p = clampPage(page);
            BeautyTypes.Service filter = service == null || service.isBlank() ? null : parseService(service);
            return repository.photos(filter, s + 1, (long) p * s).collectList()
                    .map(list -> new PhotoPage(list.size() > s ? list.subList(0, s) : list, p, s, list.size() > s));
        });
    }

    Mono<StoredObject> image(UUID id, String variant) {
        return Mono.defer(() -> storage.download(Photo.objectKey(id, Variant.of(variant))));
    }

    /**
     * Processa, guarda as duas versoes no MinIO e so entao registra no banco.
     * Se algo falhar no meio, apaga o que ja tinha subido (nao deixa arquivo orfao).
     */
    Mono<Photo> addPhoto(byte[] data, PhotoForm form) {
        UUID id = UUID.randomUUID();
        String fullKey = Photo.objectKey(id, Variant.FULL);
        String thumbKey = Photo.objectKey(id, Variant.THUMB);
        return images.process(data).flatMap(img -> Mono.when(
                                storage.upload(fullKey, img.full(), "image/jpeg"),
                                storage.upload(thumbKey, img.thumb(), "image/jpeg"))
                        .then(Mono.defer(() -> repository.insertPhoto(new Photo(id, form.petName(), form.species(),
                                form.service(), form.caption(), img.width(), img.height(), null))))
                        .onErrorResume(ex -> removeObjects(id).then(Mono.error(ex))));
    }

    Mono<Void> deletePhoto(UUID id) {
        return repository.deletePhoto(id)
                .flatMap(n -> n == 0 ? Mono.error(new NotFoundException("Foto não encontrada")) : removeObjects(id));
    }

    private Mono<Void> removeObjects(UUID id) {
        return Flux.just(Variant.FULL, Variant.THUMB)
                .flatMap(v -> storage.delete(Photo.objectKey(id, v)).onErrorResume(ex -> {
                    log.warn("Nao foi possivel apagar {} do MinIO: {}", Photo.objectKey(id, v), ex.toString());
                    return Mono.empty();
                }))
                .then();
    }

    // ---------------- Depoimentos ----------------

    Mono<TestimonialPage> testimonials(int page, int size) {
        return Mono.defer(() -> {
            int s = clampSize(size);
            int p = clampPage(page);
            return repository.testimonials(Status.APPROVED, s + 1, (long) p * s).collectList()
                    .zipWith(repository.summary())
                    .map(t -> {
                        List<Testimonial> list = t.getT1();
                        return new TestimonialPage(list.size() > s ? list.subList(0, s) : list, p, s, list.size() > s, t.getT2());
                    });
        });
    }

    /** Depoimento do site: entra PENDENTE e so aparece depois que a clinica aprova. */
    Mono<Testimonial> submit(NewTestimonial input, String ip) {
        if (input.isBot()) {
            // finge que deu certo para o robo nao tentar de novo; nada e gravado
            return Mono.just(toTestimonial(input, Status.PENDING));
        }
        return throttle.allow(ip).flatMap(ok -> ok
                ? Mono.defer(() -> repository.insertTestimonial(toTestimonial(input, Status.PENDING)))
                : Mono.error(new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                        "Você já enviou depoimentos demais agora. Tente mais tarde.")));
    }

    /** Depoimento cadastrado pela propria clinica (ex.: recebido no WhatsApp): ja entra aprovado. */
    Mono<Testimonial> addApproved(NewTestimonial input) {
        return Mono.defer(() -> repository.insertTestimonial(toTestimonial(input, Status.APPROVED)));
    }

    Flux<Testimonial> pending(int page, int size) {
        return Flux.defer(() -> repository.testimonials(Status.PENDING, clampSize(size), (long) clampPage(page) * clampSize(size)));
    }

    Mono<Void> approve(UUID id) {
        return repository.approve(id)
                .flatMap(n -> n == 0 ? Mono.error(new NotFoundException("Depoimento pendente não encontrado")) : Mono.empty());
    }

    Mono<Void> deleteTestimonial(UUID id) {
        return repository.deleteTestimonial(id)
                .flatMap(n -> n == 0 ? Mono.error(new NotFoundException("Depoimento não encontrado")) : Mono.empty());
    }

    // ---------------- Auxiliares ----------------

    static Testimonial toTestimonial(NewTestimonial in, Status status) {
        String author = BeautyTypes.clean(in.author());
        String message = BeautyTypes.cleanMultiline(in.message());
        if (author.isEmpty() || message.length() < 10) {
            throw new IllegalArgumentException("Conte um pouco mais no depoimento (mínimo 10 caracteres)");
        }
        String pet = BeautyTypes.clean(in.petName());
        return new Testimonial(UUID.randomUUID(), author, pet.isEmpty() ? null : pet, in.rating(), message, status, null);
    }

    static BeautyTypes.Service parseService(String raw) {
        try {
            return BeautyTypes.Service.valueOf(raw.strip().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Serviço inválido: " + raw);
        }
    }

    static int clampSize(int size) {
        return Math.max(1, Math.min(MAX_PAGE_SIZE, size));
    }

    static int clampPage(int page) {
        return Math.max(0, Math.min(MAX_PAGE, page));
    }
}
