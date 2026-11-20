package br.com.mundopet.site.internal;

import java.time.Duration;
import java.time.OffsetDateTime;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

import br.com.mundopet.site.SiteSettingsApi;
import reactor.core.publisher.Mono;

/**
 * Le e grava as configuracoes do site.
 * Leitura com cache de {@value #CACHE_SECONDS}s em cada replica: o site inteiro le isso a cada visita,
 * e uma alteracao do dono chega em todas as replicas em poucos segundos.
 */
@Service
class SiteService implements SiteSettingsApi {

    static final long CACHE_SECONDS = 5;
    private static final Logger log = LoggerFactory.getLogger(SiteService.class);

    /** Resposta da API. settings = null enquanto o dono nao salvar (o site usa os textos padrao). */
    record Snapshot(int version, SiteSettings settings, OffsetDateTime updatedAt) {
        static final Snapshot EMPTY = new Snapshot(0, null, null);
    }

    record Update(int version, SiteSettings settings) {
    }

    private final SiteRepository repository;
    private final ObjectMapper json;
    private final Duration ttl;
    private volatile Mono<Snapshot> cached;

    SiteService(SiteRepository repository, ObjectMapper json) {
        this(repository, json, Duration.ofSeconds(CACHE_SECONDS));
    }

    @Autowired
    SiteService(SiteRepository repository, ObjectMapper json, @Value("${mundopet.site.cache-ttl:5s}") Duration ttl) {
        this.repository = repository;
        this.json = json;
        this.ttl = ttl;
        this.cached = load();
    }

    private Mono<Snapshot> load() {
        // erro nao fica em cache (proxima leitura tenta de novo)
        return Mono.defer(() -> repository.find().map(this::toSnapshot).defaultIfEmpty(Snapshot.EMPTY))
                .cache(v -> ttl, e -> Duration.ZERO, () -> ttl);
    }

    Mono<Snapshot> current() {
        return cached;
    }

    Mono<Snapshot> save(Update update) {
        return Mono.fromCallable(() -> json.writeValueAsString(normalize(update.settings())))
                .flatMap(raw -> repository.save(raw, update.version()))
                .map(this::toSnapshot)
                .switchIfEmpty(Mono.error(() -> new ResponseStatusException(HttpStatus.CONFLICT,
                        "Outra pessoa salvou alterações antes de você. Recarregue a página para ver a versão atual.")))
                .doOnNext(s -> cached = load());
    }

    @Override
    public Mono<StoreDelivery> delivery() {
        return current()
                .filter(s -> s.settings() != null)
                .map(s -> new StoreDelivery(s.settings().address().lat(), s.settings().address().lng(),
                        s.settings().delivery().pricePerKm(), s.settings().delivery().maxKm()))
                .onErrorResume(ex -> {
                    log.warn("Configuracoes do site indisponiveis para a entrega: {}", ex.toString());
                    return Mono.empty();
                });
    }

    private Snapshot toSnapshot(SiteRepository.Row row) {
        try {
            return new Snapshot(row.version(), json.readValue(row.json(), SiteSettings.class), row.updatedAt());
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Configuracoes do site corrompidas", e);
        }
    }

    /** UF sempre maiuscula e espacos nas pontas removidos dos campos principais. */
    static SiteSettings normalize(SiteSettings s) {
        var a = s.address();
        var address = new SiteSettings.Address(a.street().strip(), a.district() == null ? null : a.district().strip(),
                a.city().strip(), a.state().toUpperCase(), a.zip(), a.lat(), a.lng(),
                a.mapsQuery() == null ? null : a.mapsQuery().strip());
        return new SiteSettings(s.store(), address, s.hours(), s.announcement(), s.hero(), s.cta(), s.chapters(), s.stats(),
                s.delivery());
    }
}
