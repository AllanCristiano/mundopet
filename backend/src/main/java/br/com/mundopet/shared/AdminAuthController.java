package br.com.mundopet.shared;

import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ServerWebExchange;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import reactor.core.publisher.Mono;

/** Entrada e saida da area administrativa (gestao do site e area da clinica). */
@RestController
@RequestMapping("/api/admin")
class AdminAuthController {

    private final AdminGuard guard;

    AdminAuthController(AdminGuard guard) {
        this.guard = guard;
    }

    record Mode(boolean enabled, boolean demo) {
    }

    /** A tela de login usa para mostrar o aviso de "modo demonstracao". */
    @GetMapping("/mode")
    ResponseEntity<Mode> mode() {
        return ResponseEntity.ok().cacheControl(CacheControl.noCache()).body(new Mode(guard.enabled(), guard.demo()));
    }

    record Login(@Size(max = 60) String username, @Size(max = 200) String password) {
    }

    @PostMapping("/login")
    Mono<AdminGuard.Session> login(@Valid @RequestBody Login body, ServerWebExchange exchange) {
        return guard.login(body.username(), body.password(), RateLimitFilter.clientIp(exchange));
    }

    @DeleteMapping("/session")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    Mono<Void> logout(@RequestHeader(value = AdminGuard.HEADER, required = false) String token) {
        return guard.logout(token);
    }
}
