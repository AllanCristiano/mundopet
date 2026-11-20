package br.com.mundopet.shared;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import reactor.test.StepVerifier;

class AdminGuardTest {

    static final String TOKEN = "a".repeat(AdminGuard.MIN_LENGTH);

    static void expectStatus(AdminGuard guard, String provided, HttpStatus status) {
        StepVerifier.create(guard.check(provided))
                .expectErrorSatisfies(e -> assertThat(((ResponseStatusException) e).getStatusCode()).isEqualTo(status))
                .verify();
    }

    @Test
    void withoutTokenOrWithShortTokenTheAdminAreaIsOff() {
        for (String configured : new String[] {null, "", "curto-demais"}) {
            AdminGuard guard = new AdminGuard(new AdminGuard.AdminProperties(configured));
            assertThat(guard.enabled()).isFalse();
            expectStatus(guard, configured, HttpStatus.FORBIDDEN);
        }
    }

    @Test
    void rightTokenPassesWrongOrMissingIs401() {
        AdminGuard guard = new AdminGuard(new AdminGuard.AdminProperties(" " + TOKEN + " "));
        assertThat(guard.enabled()).isTrue();
        StepVerifier.create(guard.check(TOKEN)).verifyComplete();
        StepVerifier.create(guard.check(" " + TOKEN)).verifyComplete();
        expectStatus(guard, null, HttpStatus.UNAUTHORIZED);
        expectStatus(guard, "", HttpStatus.UNAUTHORIZED);
        expectStatus(guard, TOKEN + "b", HttpStatus.UNAUTHORIZED);
    }
}
