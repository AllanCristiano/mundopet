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
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/**
 * Taxa = distancia ate a loja (km, arredondada para cima em 0,1) x preco fixo por km.
 * Distancia = linha reta (haversine) x fator de ruas. Acima do raio maximo: fora da area.
 * Coordenadas do CEP: cache (Redis) -> AwesomeAPI -> BrasilAPI. Se nenhuma souber: UNKNOWN (a loja combina).
 */
@Service
class DistanceDeliveryCalculator implements DeliveryCalculator {

    private static final Logger log = LoggerFactory.getLogger(DistanceDeliveryCalculator.class);

    private final DeliveryProperties props;
    private final GeoCache cache;
    private final List<Geocoder> geocoders;

    DistanceDeliveryCalculator(DeliveryProperties props, GeoCache cache, List<Geocoder> geocoders) {
        this.props = props;
        this.cache = cache;
        this.geocoders = geocoders;
    }

    @Override
    public Mono<DeliveryQuote> quote(String rawCep) {
        String cep = rawCep == null ? "" : rawCep.replaceAll("\\D", "");
        if (cep.length() != 8) {
            return Mono.just(unknown());
        }
        return cache.get(cep)
                .switchIfEmpty(Mono.defer(() -> fromGeocoders(cep)))
                .map(this::priced)
                .defaultIfEmpty(unknown());
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
        BigDecimal km = BigDecimal.valueOf(props.store().distanceKm(destination) * props.roadFactor())
                .setScale(1, RoundingMode.CEILING);
        if (km.compareTo(props.maxKm()) > 0) {
            return new DeliveryQuote(Status.OUT_OF_AREA, km, null, props.pricePerKm(), props.maxKm());
        }
        BigDecimal fee = km.multiply(props.pricePerKm()).setScale(2, RoundingMode.HALF_UP);
        return new DeliveryQuote(Status.OK, km, fee, props.pricePerKm(), props.maxKm());
    }

    private DeliveryQuote unknown() {
        return new DeliveryQuote(Status.UNKNOWN, null, null, props.pricePerKm(), props.maxKm());
    }
}
