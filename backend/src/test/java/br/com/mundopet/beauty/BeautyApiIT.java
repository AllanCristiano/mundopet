package br.com.mundopet.beauty;

import static org.assertj.core.api.Assertions.assertThat;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import javax.imageio.ImageIO;

import org.junit.jupiter.api.Test;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.MediaType;
import org.springframework.http.client.MultipartBodyBuilder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.reactive.server.WebTestClient;
import org.springframework.web.reactive.function.BodyInserters;

import br.com.mundopet.shared.AdminGuard;
import br.com.mundopet.support.IntegrationTestBase;

/** Integracao do Espaco Beleza com Postgres, Redis e MinIO REAIS. */
class BeautyApiIT extends IntegrationTestBase {

    static final String TOKEN = "token-de-teste-da-clinica-123456";

    @DynamicPropertySource
    static void admin(DynamicPropertyRegistry r) {
        r.add("mundopet.admin.token", () -> TOKEN);
    }

    record Photo(String id, String petName, String species, String service, String caption, int width, int height,
                 String thumbUrl, String fullUrl) {
    }

    record PhotoPage(List<Photo> items, boolean hasMore) {
    }

    record Testimonial(String id, String author, String petName, int rating, String message, String status) {
    }

    record Summary(double average, long count) {
    }

    record TestimonialPage(List<Testimonial> items, boolean hasMore, Summary summary) {
    }

    static byte[] png(int w, int h) throws IOException {
        BufferedImage img = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = img.createGraphics();
        g.setColor(new Color(0xE3B062));
        g.fillRect(0, 0, w, h);
        g.dispose();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(img, "png", out);
        return out.toByteArray();
    }

    private WebTestClient.ResponseSpec upload(String token, byte[] file, String petName) {
        MultipartBodyBuilder body = new MultipartBodyBuilder();
        body.part("file", new ByteArrayResource(file) {
            @Override
            public String getFilename() {
                return "foto.png";
            }
        }).contentType(MediaType.IMAGE_PNG);
        body.part("petName", petName);
        body.part("species", "CAO");
        body.part("service", "TOSA");
        body.part("caption", "Tosa de verão");
        var req = web.post().uri("/api/beauty/admin/photos");
        if (token != null) {
            req = req.header(AdminGuard.HEADER, token);
        }
        return req.body(BodyInserters.fromMultipartData(body.build())).exchange();
    }

    private PhotoPage photos(String query) {
        return web.get().uri("/api/beauty/photos?" + query).exchange().expectStatus().isOk()
                .expectHeader().cacheControl(org.springframework.http.CacheControl.noCache()) // publicou, aparece na hora
                .expectBody(PhotoPage.class).returnResult().getResponseBody();
    }

    @Test
    void clinicUploadsPhotoServedFromMinioThenDeletesIt() throws IOException {
        Photo photo = upload(TOKEN, png(2400, 1600), "Thor").expectStatus().isCreated()
                .expectBody(Photo.class).returnResult().getResponseBody();
        assertThat(photo.petName()).isEqualTo("Thor");
        assertThat(photo.service()).isEqualTo("TOSA");
        assertThat(photo.width()).isEqualTo(1600);
        assertThat(photo.height()).isEqualTo(1067);
        assertThat(photo.thumbUrl()).isEqualTo("/api/beauty/photos/" + photo.id() + "/thumb");

        assertThat(photos("service=TOSA&size=48").items()).extracting(Photo::id).contains(photo.id());
        assertThat(photos("service=SPA&size=48").items()).extracting(Photo::id).doesNotContain(photo.id());

        byte[] thumb = web.get().uri(photo.thumbUrl()).exchange()
                .expectStatus().isOk()
                .expectHeader().contentType(MediaType.IMAGE_JPEG)
                .expectHeader().valueMatches("Cache-Control", ".*max-age=86400.*")
                .expectBody(byte[].class).returnResult().getResponseBody();
        BufferedImage t = ImageIO.read(new ByteArrayInputStream(thumb));
        assertThat(Math.max(t.getWidth(), t.getHeight())).isEqualTo(600);
        web.get().uri(photo.fullUrl()).exchange().expectStatus().isOk();
        web.get().uri("/api/beauty/photos/" + photo.id() + "/original").exchange().expectStatus().isBadRequest();

        // apagar exige token
        web.delete().uri("/api/beauty/admin/photos/" + photo.id()).exchange().expectStatus().isUnauthorized();
        web.delete().uri("/api/beauty/admin/photos/" + photo.id()).header(AdminGuard.HEADER, TOKEN).exchange().expectStatus().isNoContent();
        web.get().uri(photo.thumbUrl()).exchange().expectStatus().isNotFound();
        web.delete().uri("/api/beauty/admin/photos/" + photo.id()).header(AdminGuard.HEADER, TOKEN).exchange().expectStatus().isNotFound();
        assertThat(photos("size=48").items()).extracting(Photo::id).doesNotContain(photo.id());
    }

    @Test
    void uploadIsRejectedWithoutTokenOrWithInvalidFile() throws IOException {
        int before = photos("size=48").items().size();
        upload(null, png(800, 600), "Rex").expectStatus().isUnauthorized();
        upload("errado", png(800, 600), "Rex").expectStatus().isUnauthorized()
                .expectBody().jsonPath("$.detail").value(d -> assertThat((String) d).contains("Entre de novo"));
        upload(TOKEN, "<script>alert(1)</script>".getBytes(), "Rex").expectStatus().isBadRequest()
                .expectBody().jsonPath("$.detail").value(d -> assertThat((String) d).contains("JPG ou PNG"));
        upload(TOKEN, png(800, 600), " ").expectStatus().isBadRequest();
        assertThat(photos("size=48").items()).hasSize(before);

        web.get().uri("/api/beauty/admin/check").exchange().expectStatus().isUnauthorized();
        web.get().uri("/api/beauty/admin/check").header(AdminGuard.HEADER, TOKEN).exchange().expectStatus().isNoContent();
        web.get().uri("/api/beauty/photos?service=xyz").exchange().expectStatus().isBadRequest();
    }

    private TestimonialPage approved() {
        return web.get().uri("/api/beauty/testimonials?size=48").exchange().expectStatus().isOk()
                .expectBody(TestimonialPage.class).returnResult().getResponseBody();
    }

    private WebTestClient.ResponseSpec submit(String ip, Map<String, Object> body) {
        return web.post().uri("/api/beauty/testimonials").header("X-Real-IP", ip)
                .contentType(MediaType.APPLICATION_JSON).bodyValue(body).exchange();
    }

    @Test
    void testimonialOnlyAppearsAfterApproval() {
        String ip = "10.0.0." + (int) (Math.random() * 200);
        String marker = "Amei o banho! " + UUID.randomUUID();
        submit(ip, Map.of("author", "Ana", "petName", "Mel", "rating", 5, "message", marker))
                .expectStatus().isAccepted().expectBody().jsonPath("$.status").isEqualTo("PENDING");
        assertThat(approved().items()).extracting(Testimonial::message).doesNotContain(marker);

        List<Testimonial> pending = web.get().uri("/api/beauty/admin/testimonials").header(AdminGuard.HEADER, TOKEN).exchange()
                .expectStatus().isOk().expectBody(new ParameterizedTypeReference<List<Testimonial>>() {}).returnResult().getResponseBody();
        Testimonial mine = pending.stream().filter(t -> t.message().equals(marker)).findFirst().orElseThrow();
        web.get().uri("/api/beauty/admin/testimonials").exchange().expectStatus().isUnauthorized();

        web.post().uri("/api/beauty/admin/testimonials/" + mine.id() + "/approve").exchange().expectStatus().isUnauthorized();
        web.post().uri("/api/beauty/admin/testimonials/" + mine.id() + "/approve").header(AdminGuard.HEADER, TOKEN).exchange()
                .expectStatus().isNoContent();
        web.post().uri("/api/beauty/admin/testimonials/" + mine.id() + "/approve").header(AdminGuard.HEADER, TOKEN).exchange()
                .expectStatus().isNotFound();

        TestimonialPage page = approved();
        assertThat(page.items()).extracting(Testimonial::message).contains(marker);
        assertThat(page.summary().count()).isPositive();
        assertThat(page.summary().average()).isBetween(1.0, 5.0);

        web.delete().uri("/api/beauty/admin/testimonials/" + mine.id()).header(AdminGuard.HEADER, TOKEN).exchange()
                .expectStatus().isNoContent();
        assertThat(approved().items()).extracting(Testimonial::message).doesNotContain(marker);
    }

    @Test
    void spamProtectionValidationAndClinicShortcut() {
        String ip = "10.1.0." + (int) (Math.random() * 200);
        Map<String, Object> ok = Map.of("author", "Ana", "rating", 4, "message", "Atendimento excelente!");
        for (int i = 0; i < 3; i++) {
            submit(ip, ok).expectStatus().isAccepted();
        }
        submit(ip, ok).expectStatus().isEqualTo(429)
                .expectBody().jsonPath("$.detail").value(d -> assertThat((String) d).contains("Tente mais tarde"));

        // robo (campo-isca preenchido): responde 202 mas nao grava
        String botMarker = "Compre seguidores " + UUID.randomUUID();
        submit("10.2.0.1", Map.of("author", "Bot", "rating", 5, "message", botMarker, "website", "spam.example"))
                .expectStatus().isAccepted();
        List<Testimonial> pending = web.get().uri("/api/beauty/admin/testimonials").header(AdminGuard.HEADER, TOKEN).exchange()
                .expectBody(new ParameterizedTypeReference<List<Testimonial>>() {}).returnResult().getResponseBody();
        assertThat(pending).extracting(Testimonial::message).doesNotContain(botMarker);

        // validacao
        submit("10.3.0.1", Map.of("author", "", "rating", 5, "message", "Muito bom mesmo")).expectStatus().isBadRequest();
        submit("10.3.0.2", Map.of("author", "Ana", "rating", 6, "message", "Muito bom mesmo")).expectStatus().isBadRequest();
        submit("10.3.0.3", Map.of("author", "Ana", "rating", 5, "message", "curto")).expectStatus().isBadRequest();

        // a clinica cadastra direto (ja aprovado)
        String marker = "Recebido no WhatsApp " + UUID.randomUUID();
        web.post().uri("/api/beauty/admin/testimonials").header(AdminGuard.HEADER, TOKEN).contentType(MediaType.APPLICATION_JSON)
                .bodyValue(Map.of("author", "Carlos", "petName", "Bob", "rating", 5, "message", marker)).exchange()
                .expectStatus().isCreated().expectBody().jsonPath("$.status").isEqualTo("APPROVED");
        assertThat(approved().items()).extracting(Testimonial::message).contains(marker);
    }
}
