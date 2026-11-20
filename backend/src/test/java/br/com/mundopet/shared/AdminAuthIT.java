package br.com.mundopet.shared;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.reactive.server.WebTestClient;

import br.com.mundopet.support.IntegrationTestBase;

/** Integracao do login administrativo com Redis REAL (sessoes e tentativas erradas). Modo demonstracao ligado. */
class AdminAuthIT extends IntegrationTestBase {

    @DynamicPropertySource
    static void admin(DynamicPropertyRegistry r) {
        r.add("mundopet.admin.username", () -> "dono");
        r.add("mundopet.admin.password", () -> "senha-de-teste-123");
        r.add("mundopet.admin.demo", () -> "true");
        r.add("mundopet.admin.token", () -> "");
    }

    private WebTestClient.ResponseSpec login(String ip, String user, String pass) {
        return web.post().uri("/api/admin/login").header("X-Real-IP", ip).contentType(MediaType.APPLICATION_JSON)
                .bodyValue(Map.of("username", user, "password", pass)).exchange();
    }

    private String token(WebTestClient.ResponseSpec res) {
        return (String) res.expectStatus().isOk().expectBody(Map.class).returnResult().getResponseBody().get("token");
    }

    @Test
    void demoBlankLoginOpensSessionUsableAcrossModulesUntilLogout() {
        web.get().uri("/api/admin/mode").exchange().expectStatus().isOk()
                .expectBody().jsonPath("$.demo").isEqualTo(true).jsonPath("$.enabled").isEqualTo(true);

        String token = token(login("10.9.0.1", "", ""));
        web.get().uri("/api/site/admin/check").header(AdminGuard.HEADER, token).exchange().expectStatus().isNoContent();
        web.get().uri("/api/beauty/admin/check").header(AdminGuard.HEADER, token).exchange().expectStatus().isNoContent();

        web.delete().uri("/api/admin/session").header(AdminGuard.HEADER, token).exchange().expectStatus().isNoContent();
        web.get().uri("/api/site/admin/check").header(AdminGuard.HEADER, token).exchange().expectStatus().isUnauthorized()
                .expectBody().jsonPath("$.detail").value(d -> assertThat((String) d).contains("Entre de novo"));
    }

    @Test
    void realPasswordWorksWrongOnesAreCountedAndBlocked() {
        login("10.9.0.2", "dono", "senha-de-teste-123").expectStatus().isOk()
                .expectBody().jsonPath("$.username").isEqualTo("dono").jsonPath("$.demo").isEqualTo(false);

        String ip = "10.9.0." + (10 + (int) (Math.random() * 200));
        for (int i = 0; i < AdminGuard.MAX_FAILURES; i++) {
            login(ip, "dono", "errada").expectStatus().isUnauthorized()
                    .expectBody().jsonPath("$.detail").isEqualTo("Login ou senha inválidos");
        }
        // bloqueado: nem a senha certa entra deste IP por um tempo
        login(ip, "dono", "senha-de-teste-123").expectStatus().isEqualTo(429);
        // outro IP segue normal
        login("10.9.0.3", "", "").expectStatus().isOk();
    }

    @Test
    void protectedRoutesNeedASession() {
        web.get().uri("/api/site/admin/check").exchange().expectStatus().isUnauthorized();
        web.get().uri("/api/site/admin/check").header(AdminGuard.HEADER, "inventado").exchange().expectStatus().isUnauthorized();
        web.post().uri("/api/admin/login").contentType(MediaType.APPLICATION_JSON)
                .bodyValue(Map.of("username", "x".repeat(61), "password", "")).exchange().expectStatus().isBadRequest();
    }
}
