package br.com.mundopet.delivery.internal;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import br.com.mundopet.delivery.DeliveryCalculator;
import br.com.mundopet.delivery.DeliveryQuote;
import br.com.mundopet.delivery.DeliveryQuote.Status;
import br.com.mundopet.site.SiteSettingsApi;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/**
 * Taxa = distancia ate a loja (km, arredondada para cima em 0,1) x preco fixo por km.
 * Distancia = linha reta (haversine) x fator de ruas. Acima do raio maximo: fora da area.
 * Coordenadas do CEP: cache (Redis) -> AwesomeAPI -> BrasilAPI. Se nenhuma souber: UNKNOWN (a loja combina).
 * Local da loja, preco por km e raio vem da pagina de gestao; enquanto o dono nao salvar, valem as variaveis de ambiente.
 */
@Service
class DistanceDeliveryCalculator implements DeliveryCalculator {

    private static final Logger log = LoggerFactory.getLogger(DistanceDeliveryCalculator.class);

    private final DeliveryProperties props;
    private final GeoCache cache;
    private final List<Geocoder> geocoders;
    private final SiteSettingsApi site;

    /** Parametros da conta: da gestao do site ou, sem ela, do ambiente. */
    record Rates(GeoPoint store, BigDecimal pricePerKm, BigDecimal maxKm) {
    }

    DistanceDeliveryCalculator(DeliveryProperties props, GeoCache cache, List<Geocoder> geocoders, SiteSettingsApi site) {
        this.props = props;
        this.cache = cache;
        this.geocoders = geocoders;
        this.site = site;
    }

    Mono<Rates> rates() {
        Rates fallback = new Rates(props.store(), props.pricePerKm(), props.maxKm());
        return site.delivery()
                .map(d -> new Rates(new GeoPoint(d.lat(), d.lng()), d.pricePerKm(), d.maxKm()))
                .onErrorResume(ex -> Mono.empty())
                .defaultIfEmpty(fallback);
    }

    @Override
    public Mono<DeliveryQuote> quote(String rawCep) {
        String cep = rawCep == null ? "" : rawCep.replaceAll("\\D", "");
        return rates().flatMap(rates -> cep.length() != 8 ? Mono.just(unknown(rates))
                : cache.get(cep)
                        .switchIfEmpty(Mono.defer(() -> fromGeocoders(cep)))
                        .map(point -> priced(point, rates))
                        .defaultIfEmpty(unknown(rates)));
    }

    private Mono<GeoPoint> fromGeocoders(String cep) {
        return Flux.fromIterable(geocoders)
                .concatMap(g -> g.locate(cep).onErrorResume(ex -> {
                    log.warn("Fonte de coordenadas {} indisponivel: {}", g.name(), ex.toString());
                    return Mono.empty();
                }), 1)
                .next()
                .flatMap(point -> cache.put(cep, point));
    }

    DeliveryQuote priced(GeoPoint destination) {
        return priced(destination, new Rates(props.store(), props.pricePerKm(), props.maxKm()));
    }

    DeliveryQuote priced(GeoPoint destination, Rates r) {
        BigDecimal km = BigDecimal.valueOf(r.store().distanceKm(destination) * props.roadFactor())
                .setScale(1, RoundingMode.CEILING);
        if (km.compareTo(r.maxKm()) > 0) {
            return new DeliveryQuote(Status.OUT_OF_AREA, km, null, r.pricePerKm(), r.maxKm());
        }
        BigDecimal fee = km.multiply(r.pricePerKm()).setScale(2, RoundingMode.HALF_UP);
        return new DeliveryQuote(Status.OK, km, fee, r.pricePerKm(), r.maxKm());
    }

    private static DeliveryQuote unknown(Rates r) {
        return new DeliveryQuote(Status.UNKNOWN, null, null, r.pricePerKm(), r.maxKm());
    }
}
