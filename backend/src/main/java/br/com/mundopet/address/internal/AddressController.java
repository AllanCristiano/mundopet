package br.com.mundopet.address.internal;

import java.time.Duration;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import br.com.mundopet.address.Address;
import reactor.core.publisher.Mono;

@RestController
@RequestMapping("/api/address")
class AddressController {

    private final CepLookupService service;

    AddressController(CepLookupService service) {
        this.service = service;
    }

    @GetMapping("/cep/{cep}")
    Mono<ResponseEntity<Address>> byCep(@PathVariable String cep) {
        return service.lookup(cep).map(a -> ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(Duration.ofDays(1)).cachePublic())
                .body(a));
    }
}
