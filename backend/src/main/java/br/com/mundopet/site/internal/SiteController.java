package br.com.mundopet.site.internal;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import br.com.mundopet.shared.AdminGuard;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import reactor.core.publisher.Mono;

@RestController
@RequestMapping("/api/site")
class SiteController {

    private final SiteService service;
    private final AdminGuard guard;

    SiteController(SiteService service, AdminGuard guard) {
        this.service = service;
        this.guard = guard;
    }

    /** Publico: o site le na abertura. Sem cache no navegador para a alteracao do dono aparecer na hora. */
    @GetMapping
    Mono<ResponseEntity<SiteService.Snapshot>> get() {
        return service.current().map(s -> ResponseEntity.ok().cacheControl(CacheControl.noCache()).body(s));
    }

    /** Confere o token da gestao (tela de entrada). */
    @GetMapping("/admin/check")
    @org.springframework.web.bind.annotation.ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT)
    Mono<Void> check(@RequestHeader(value = AdminGuard.HEADER, required = false) String token) {
        return guard.check(token);
    }

    record UpdateRequest(@Min(0) int version, @NotNull @Valid SiteSettings settings) {
    }

    /** Gestao (token). Envia a versao que foi carregada; se alguem salvou no meio, responde 409. */
    @PutMapping("/admin")
    Mono<SiteService.Snapshot> save(@RequestHeader(value = AdminGuard.HEADER, required = false) String token,
                                    @Valid @RequestBody UpdateRequest body) {
        return guard.check(token).then(Mono.defer(() -> service.save(new SiteService.Update(body.version(), body.settings()))));
    }
}
