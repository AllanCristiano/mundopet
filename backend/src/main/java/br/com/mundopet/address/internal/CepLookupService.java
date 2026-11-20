package br.com.mundopet.address.internal;

import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import br.com.mundopet.address.Address;
import br.com.mundopet.shared.DependencyUnavailableException;
import br.com.mundopet.shared.NotFoundException;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/**
 * Busca o endereco pelo CEP: cache (Redis) -> ViaCEP -> BrasilAPI.
 * Se uma fonte falhar OU nao conhecer o CEP, tenta a proxima.
 * Resultado: encontrado (e guarda no cache) | 404 se alguma fonte respondeu "nao existe" | 503 se todas falharam.
 */
@Service
class CepLookupService {

    private static final Logger log = LoggerFactory.getLogger(CepLookupService.class);

    private final CepCache cache;
    private final List<CepProvider> providers;

    CepLookupService(CepCache cache, List<CepProvider> providers) {
        this.cache = cache;
        this.providers = providers;
    }

    Mono<Address> lookup(String rawCep) {
        String cep = Address.normalizeCep(rawCep);
        if (cep == null) {
            return Mono.error(new IllegalArgumentException("CEP inválido: informe 8 dígitos"));
        }
        return cache.get(cep).switchIfEmpty(Mono.defer(() -> fromProviders(cep)));
    }

    private Mono<Address> fromProviders(String cep) {
        AtomicBoolean someoneAnswered = new AtomicBoolean(false);
        return Flux.fromIterable(providers)
                .concatMap(p -> p.find(cep)
                        .doOnSuccess(a -> someoneAnswered.set(true))
                        .onErrorResume(ex -> {
                            log.warn("Fonte de CEP {} indisponivel: {}", p.name(), ex.toString());
                            return Mono.empty();
                        }), 1)
                .next()
                .flatMap(address -> cache.put(address, cep))
                .switchIfEmpty(Mono.defer(() -> Mono.error(someoneAnswered.get()
                        ? new NotFoundException("CEP não encontrado")
                        : new DependencyUnavailableException("Consulta de CEP", null))));
    }
}
