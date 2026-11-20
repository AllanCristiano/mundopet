package br.com.mundopet.beauty.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import java.util.stream.IntStream;
import java.util.zip.CRC32;

import javax.imageio.ImageIO;

import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.data.redis.core.ReactiveValueOperations;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import br.com.mundopet.beauty.internal.BeautyTypes.NewTestimonial;
import br.com.mundopet.beauty.internal.BeautyTypes.Photo;
import br.com.mundopet.beauty.internal.BeautyTypes.PhotoForm;
import br.com.mundopet.beauty.internal.BeautyTypes.Service;
import br.com.mundopet.beauty.internal.BeautyTypes.Species;
import br.com.mundopet.beauty.internal.BeautyTypes.Status;
import br.com.mundopet.beauty.internal.BeautyTypes.Summary;
import br.com.mundopet.beauty.internal.BeautyTypes.Testimonial;
import br.com.mundopet.beauty.internal.BeautyTypes.Variant;
import br.com.mundopet.files.StorageService;
import br.com.mundopet.files.StoredObject;
import br.com.mundopet.shared.DependencyUnavailableException;
import br.com.mundopet.shared.NotFoundException;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

/** Unitarios + falha do Espaco Beleza. */
class BeautyUnitTest {

    // ---------------- Imagens de teste ----------------

    static byte[] image(int w, int h, String format, boolean transparent) {
        BufferedImage img = new BufferedImage(w, h, transparent ? BufferedImage.TYPE_INT_ARGB : BufferedImage.TYPE_INT_RGB);
        Graphics2D g = img.createGraphics();
        if (!transparent) {
            g.setColor(new Color(0xE3B062));
            g.fillRect(0, 0, w, h);
        }
        g.setColor(Color.BLACK);
        g.fillOval(w / 4, h / 4, w / 2, h / 2);
        g.dispose();
        try {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            ImageIO.write(img, format, out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    /** JPEG com um bloco EXIF (APP1) inserido logo apos o SOI, como uma foto de celular. */
    static byte[] jpegWithExif(int w, int h) {
        byte[] jpeg = image(w, h, "jpg", false);
        byte[] payload = "Exif\0\0GPS-LATITUDE-SECRETA".getBytes(StandardCharsets.ISO_8859_1);
        ByteBuffer b = ByteBuffer.allocate(jpeg.length + payload.length + 4);
        b.put(jpeg, 0, 2).put((byte) 0xFF).put((byte) 0xE1).putShort((short) (payload.length + 2)).put(payload);
        b.put(jpeg, 2, jpeg.length - 2);
        return b.array();
    }

    /** PNG so com cabecalho dizendo ter w x h (sem pixels): testa a recusa ANTES de decodificar. */
    static byte[] pngHeaderOnly(int w, int h) {
        ByteBuffer ihdr = ByteBuffer.allocate(17);
        ihdr.put("IHDR".getBytes(StandardCharsets.US_ASCII)).putInt(w).putInt(h).put((byte) 8).put((byte) 2)
                .put((byte) 0).put((byte) 0).put((byte) 0);
        CRC32 crc = new CRC32();
        crc.update(ihdr.array());
        ByteBuffer png = ByteBuffer.allocate(8 + 4 + 17 + 4);
        png.put(new byte[] {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A}).putInt(13).put(ihdr.array()).putInt((int) crc.getValue());
        return png.array();
    }

    static BufferedImage read(byte[] data) throws IOException {
        return ImageIO.read(new ByteArrayInputStream(data));
    }

    // ---------------- ImageProcessor ----------------

    @Test
    void bigJpegBecomesFullAndThumbWithinLimitsKeepingAspect() throws IOException {
        var p = ImageProcessor.processSync(image(3200, 2400, "jpg", false));
        BufferedImage full = read(p.full());
        BufferedImage thumb = read(p.thumb());
        assertThat(full.getWidth()).isEqualTo(1600);
        assertThat(full.getHeight()).isEqualTo(1200);
        assertThat(thumb.getWidth()).isEqualTo(600);
        assertThat(thumb.getHeight()).isEqualTo(450);
        assertThat(p.width()).isEqualTo(1600);
        assertThat(p.height()).isEqualTo(1200);
        assertThat(ImageProcessor.isJpeg(p.full())).isTrue();
    }

    @Test
    void smallImageIsNeverEnlargedAndTransparentPngGetsWhiteBackground() throws IOException {
        var p = ImageProcessor.processSync(image(400, 300, "png", true));
        BufferedImage full = read(p.full());
        assertThat(full.getWidth()).isEqualTo(400);
        assertThat(full.getHeight()).isEqualTo(300);
        // canto transparente vira branco (JPEG nao tem transparencia)
        assertThat(new Color(full.getRGB(2, 2)).getRed()).isGreaterThan(240);
    }

    @Test
    void reencodingRemovesExifMetadata() {
        byte[] withExif = jpegWithExif(800, 600);
        assertThat(new String(withExif, StandardCharsets.ISO_8859_1)).contains("GPS-LATITUDE-SECRETA");
        var p = ImageProcessor.processSync(withExif);
        assertThat(new String(p.full(), StandardCharsets.ISO_8859_1)).doesNotContain("GPS-LATITUDE-SECRETA").doesNotContain("Exif");
        assertThat(new String(p.thumb(), StandardCharsets.ISO_8859_1)).doesNotContain("Exif");
    }

    @Test
    void rejectsInvalidUploads() {
        assertThatThrownBy(() -> ImageProcessor.processSync(new byte[0])).hasMessageContaining("Envie");
        assertThatThrownBy(() -> ImageProcessor.processSync(null)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> ImageProcessor.processSync(new byte[ImageProcessor.MAX_BYTES + 1])).hasMessageContaining("5 MB");
        assertThatThrownBy(() -> ImageProcessor.processSync(image(300, 300, "gif", false))).hasMessageContaining("JPG ou PNG");
        assertThatThrownBy(() -> ImageProcessor.processSync("<svg onload=alert(1)>".getBytes())).hasMessageContaining("JPG ou PNG");
        assertThatThrownBy(() -> ImageProcessor.processSync(image(100, 400, "png", false))).hasMessageContaining("pequena");
        // "bomba": cabecalho diz 20000 x 20000 = 400 MP
        assertThatThrownBy(() -> ImageProcessor.processSync(pngHeaderOnly(20000, 20000))).hasMessageContaining("grande demais");
        // assinatura de JPEG seguida de lixo
        byte[] broken = new byte[2000];
        broken[0] = (byte) 0xFF;
        broken[1] = (byte) 0xD8;
        broken[2] = (byte) 0xFF;
        assertThatThrownBy(() -> ImageProcessor.processSync(broken)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void processRunsOffTheEventLoop() {
        var processor = new ImageProcessor();
        StepVerifier.create(processor.process(image(640, 480, "jpg", false)))
                .assertNext(p -> assertThat(p.width()).isEqualTo(640))
                .verifyComplete();
        StepVerifier.create(processor.process(new byte[0])).expectError(IllegalArgumentException.class).verify();
        processor.destroy();
    }

    // ---------------- Tipos e validacao ----------------

    @Test
    void photoFormValidatesAndNormalizes() {
        var f = PhotoForm.of("  Thor\n ", "gato", "tosa", "  Tosa   bebê ");
        assertThat(f.petName()).isEqualTo("Thor");
        assertThat(f.species()).isEqualTo(Species.GATO);
        assertThat(f.service()).isEqualTo(Service.TOSA);
        assertThat(f.caption()).isEqualTo("Tosa bebê");

        var defaults = PhotoForm.of("Mel", null, " ", "");
        assertThat(defaults.species()).isEqualTo(Species.CAO);
        assertThat(defaults.service()).isEqualTo(Service.BANHO_TOSA);
        assertThat(defaults.caption()).isNull();

        assertThatThrownBy(() -> PhotoForm.of(" ", "CAO", "BANHO", null)).hasMessageContaining("nome do pet");
        assertThatThrownBy(() -> PhotoForm.of("x".repeat(41), "CAO", "BANHO", null)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> PhotoForm.of("Rex", "DRAGAO", "BANHO", null)).hasMessageContaining("DRAGAO");
        assertThatThrownBy(() -> PhotoForm.of("Rex", "CAO", "BANHO", "x".repeat(161))).hasMessageContaining("Legenda");
    }

    @Test
    void textCleanupAndVariants() {
        assertThat(BeautyTypes.clean(null)).isEmpty();
        assertThat(BeautyTypes.cleanMultiline("  Amei!\r\n\n\n\nVoltaremos \t sempre\u0007 ")).isEqualTo("Amei!\n\nVoltaremos sempre");
        assertThat(BeautyTypes.cleanMultiline(null)).isEmpty();
        assertThat(Variant.of("thumb")).isEqualTo(Variant.THUMB);
        assertThat(Variant.of("full")).isEqualTo(Variant.FULL);
        assertThatThrownBy(() -> Variant.of("../../etc")).isInstanceOf(IllegalArgumentException.class);
        UUID id = UUID.randomUUID();
        Photo p = new Photo(id, "Rex", Species.CAO, Service.BANHO, null, 10, 10, null);
        assertThat(p.getThumbUrl()).isEqualTo("/api/beauty/photos/" + id + "/thumb");
        assertThat(p.getFullUrl()).endsWith("/full");
        assertThat(Photo.objectKey(id, Variant.FULL)).isEqualTo("beauty/" + id + "/full.jpg");
        assertThat(new NewTestimonial("a", null, 5, "1234567890", " ").isBot()).isFalse();
        assertThat(new NewTestimonial("a", null, 5, "1234567890", "http://spam").isBot()).isTrue();
    }

    // ---------------- Servico ----------------

    private final BeautyRepository repo = mock(BeautyRepository.class);
    private final StorageService storage = mock(StorageService.class);
    private final ImageProcessor images = mock(ImageProcessor.class);
    private final TestimonialThrottle throttle = mock(TestimonialThrottle.class);
    private final BeautyService service = new BeautyService(repo, storage, images, throttle);

    static Photo photo(String name) {
        return new Photo(UUID.randomUUID(), name, Species.CAO, Service.BANHO, null, 800, 600, null);
    }

    static Testimonial testimonial(String author) {
        return new Testimonial(UUID.randomUUID(), author, null, 5, "Muito bom o atendimento", Status.APPROVED, null);
    }

    @Test
    void photosPageDetectsNextPageAndClampsSize() {
        when(repo.photos(any(), anyInt(), anyLong())).thenReturn(Flux.just(photo("A"), photo("B"), photo("C")));
        StepVerifier.create(service.photos(null, 0, 2)).assertNext(p -> {
            assertThat(p.items()).extracting(Photo::petName).containsExactly("A", "B");
            assertThat(p.hasMore()).isTrue();
        }).verifyComplete();
        verify(repo).photos(null, 3, 0L);

        service.photos("tosa", 9999, 1000).block();
        verify(repo).photos(Service.TOSA, BeautyService.MAX_PAGE_SIZE + 1, (long) BeautyService.MAX_PAGE * BeautyService.MAX_PAGE_SIZE);

        StepVerifier.create(service.photos("xyz", 0, 10)).expectError(IllegalArgumentException.class).verify();
    }

    @Test
    void addPhotoStoresBothVersionsThenSavesRow() {
        when(images.process(any())).thenReturn(Mono.just(new ImageProcessor.Processed(new byte[] {1}, new byte[] {2}, 800, 600)));
        when(storage.upload(anyString(), any(), anyString())).thenAnswer(inv -> Mono.just(inv.getArgument(0)));
        when(repo.insertPhoto(any())).thenAnswer(inv -> Mono.just(inv.getArgument(0)));

        StepVerifier.create(service.addPhoto(new byte[] {9}, PhotoForm.of("Mel", "CAO", "SPA", null)))
                .assertNext(p -> {
                    assertThat(p.petName()).isEqualTo("Mel");
                    assertThat(p.width()).isEqualTo(800);
                    verify(storage).upload(Photo.objectKey(p.id(), Variant.FULL), new byte[] {1}, "image/jpeg");
                    verify(storage).upload(Photo.objectKey(p.id(), Variant.THUMB), new byte[] {2}, "image/jpeg");
                })
                .verifyComplete();
        verify(storage, never()).delete(anyString());
    }

    @Test
    void databaseFailureAfterUploadRemovesTheFilesSoNothingIsOrphaned() {
        when(images.process(any())).thenReturn(Mono.just(new ImageProcessor.Processed(new byte[] {1}, new byte[] {2}, 800, 600)));
        when(storage.upload(anyString(), any(), anyString())).thenAnswer(inv -> Mono.just(inv.getArgument(0)));
        when(repo.insertPhoto(any())).thenReturn(Mono.error(new DataAccessResourceFailureException("down")));
        when(storage.delete(anyString())).thenReturn(Mono.empty());

        StepVerifier.create(service.addPhoto(new byte[] {9}, PhotoForm.of("Mel", null, null, null)))
                .expectError(DataAccessResourceFailureException.class).verify();
        verify(storage, times(2)).delete(anyString());
    }

    @Test
    void storageDownFailsUploadAndCleanupErrorsAreIgnored() {
        when(images.process(any())).thenReturn(Mono.just(new ImageProcessor.Processed(new byte[] {1}, new byte[] {2}, 800, 600)));
        when(storage.upload(anyString(), any(), anyString())).thenReturn(Mono.error(new DependencyUnavailableException("MinIO", null)));
        when(storage.delete(anyString())).thenReturn(Mono.error(new DependencyUnavailableException("MinIO", null)));
        StepVerifier.create(service.addPhoto(new byte[] {9}, PhotoForm.of("Mel", null, null, null)))
                .expectError(DependencyUnavailableException.class).verify();
        verify(repo, never()).insertPhoto(any());
    }

    @Test
    void invalidImageNeverTouchesStorage() {
        when(images.process(any())).thenReturn(Mono.error(new IllegalArgumentException("JPG ou PNG")));
        StepVerifier.create(service.addPhoto(new byte[] {9}, PhotoForm.of("Mel", null, null, null)))
                .expectError(IllegalArgumentException.class).verify();
        verify(storage, never()).upload(anyString(), any(), anyString());
    }

    @Test
    void deletePhotoRemovesRowThenFiles() {
        UUID id = UUID.randomUUID();
        when(repo.deletePhoto(id)).thenReturn(Mono.just(1L));
        when(storage.delete(anyString())).thenReturn(Mono.empty());
        StepVerifier.create(service.deletePhoto(id)).verifyComplete();
        verify(storage).delete(Photo.objectKey(id, Variant.FULL));
        verify(storage).delete(Photo.objectKey(id, Variant.THUMB));

        when(repo.deletePhoto(id)).thenReturn(Mono.just(0L));
        StepVerifier.create(service.deletePhoto(id)).expectError(NotFoundException.class).verify();
    }

    @Test
    void imageGoesToTheRightObjectAndRejectsUnknownVariant() {
        UUID id = UUID.randomUUID();
        when(storage.download(Photo.objectKey(id, Variant.THUMB))).thenReturn(Mono.just(new StoredObject(new byte[] {1}, "image/jpeg")));
        StepVerifier.create(service.image(id, "thumb")).expectNextCount(1).verifyComplete();
        StepVerifier.create(service.image(id, "original")).expectError(IllegalArgumentException.class).verify();
    }

    @Test
    void testimonialsPageHasSummary() {
        when(repo.testimonials(eq(Status.APPROVED), anyInt(), anyLong())).thenReturn(Flux.just(testimonial("Ana")));
        when(repo.summary()).thenReturn(Mono.just(new Summary(4.8, 21)));
        StepVerifier.create(service.testimonials(0, 12)).assertNext(p -> {
            assertThat(p.items()).hasSize(1);
            assertThat(p.hasMore()).isFalse();
            assertThat(p.summary().average()).isEqualTo(4.8);
        }).verifyComplete();
    }

    @Test
    void publicTestimonialIsPendingAndThrottled() {
        var input = new NewTestimonial("  Ana  ", " Mel ", 5, "Amei o banho da Mel!", null);
        when(throttle.allow("1.2.3.4")).thenReturn(Mono.just(true));
        when(repo.insertTestimonial(any())).thenAnswer(inv -> Mono.just(inv.getArgument(0)));
        StepVerifier.create(service.submit(input, "1.2.3.4")).assertNext(t -> {
            assertThat(t.status()).isEqualTo(Status.PENDING);
            assertThat(t.author()).isEqualTo("Ana");
            assertThat(t.petName()).isEqualTo("Mel");
        }).verifyComplete();

        when(throttle.allow("1.2.3.4")).thenReturn(Mono.just(false));
        StepVerifier.create(service.submit(input, "1.2.3.4"))
                .expectErrorSatisfies(e -> assertThat(((ResponseStatusException) e).getStatusCode()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS))
                .verify();
    }

    @Test
    void botIsSilentlyIgnored() {
        StepVerifier.create(service.submit(new NewTestimonial("Bot", null, 5, "Compre seguidores agora", "spam.com"), "9.9.9.9"))
                .expectNextCount(1).verifyComplete();
        verify(repo, never()).insertTestimonial(any());
        verify(throttle, never()).allow(anyString());
    }

    @Test
    void clinicTestimonialIsApprovedRightAway() {
        when(repo.insertTestimonial(any())).thenAnswer(inv -> Mono.just(inv.getArgument(0)));
        StepVerifier.create(service.addApproved(new NewTestimonial("Ana", "", 4, "Recebido pelo WhatsApp", null)))
                .assertNext(t -> {
                    assertThat(t.status()).isEqualTo(Status.APPROVED);
                    assertThat(t.petName()).isNull();
                })
                .verifyComplete();
        // so espacos nao contam como texto
        StepVerifier.create(service.addApproved(new NewTestimonial("Ana", null, 4, "  a      b  ", null)))
                .expectError(IllegalArgumentException.class).verify();
    }

    @Test
    void moderationActions() {
        UUID id = UUID.randomUUID();
        when(repo.approve(id)).thenReturn(Mono.just(1L));
        when(repo.deleteTestimonial(id)).thenReturn(Mono.just(1L));
        StepVerifier.create(service.approve(id)).verifyComplete();
        StepVerifier.create(service.deleteTestimonial(id)).verifyComplete();

        when(repo.approve(id)).thenReturn(Mono.just(0L));
        when(repo.deleteTestimonial(id)).thenReturn(Mono.just(0L));
        StepVerifier.create(service.approve(id)).expectError(NotFoundException.class).verify();
        StepVerifier.create(service.deleteTestimonial(id)).expectError(NotFoundException.class).verify();

        when(repo.testimonials(eq(Status.PENDING), anyInt(), anyLong())).thenReturn(Flux.just(testimonial("X")));
        StepVerifier.create(service.pending(0, 10)).expectNextCount(1).verifyComplete();
    }

    @Test
    void databaseDownPropagates() {
        when(repo.photos(any(), anyInt(), anyLong())).thenReturn(Flux.error(new DataAccessResourceFailureException("down")));
        StepVerifier.create(service.photos(null, 0, 10)).expectError(DataAccessResourceFailureException.class).verify();
    }

    // ---------------- Anti-spam ----------------

    @Test
    @SuppressWarnings("unchecked")
    void throttleAllowsThreePerHourAndFailsOpen() {
        ReactiveStringRedisTemplate redis = mock(ReactiveStringRedisTemplate.class);
        ReactiveValueOperations<String, String> ops = mock(ReactiveValueOperations.class);
        when(redis.opsForValue()).thenReturn(ops);
        when(redis.expire(anyString(), any(Duration.class))).thenReturn(Mono.just(true));
        var throttle = new TestimonialThrottle(redis);

        List<Long> counts = IntStream.rangeClosed(1, 4).mapToObj(Long::valueOf).toList();
        for (long n : counts) {
            when(ops.increment(anyString())).thenReturn(Mono.just(n));
            assertThat(throttle.allow("1.1.1.1").block()).isEqualTo(n <= TestimonialThrottle.MAX_PER_HOUR);
        }
        verify(redis, times(1)).expire(anyString(), any(Duration.class));

        when(ops.increment(anyString())).thenReturn(Mono.error(new RedisConnectionFailureException("down")));
        assertThat(throttle.allow("1.1.1.1").block()).isTrue();
    }
}
