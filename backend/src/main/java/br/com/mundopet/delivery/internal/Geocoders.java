package br.com.mundopet.delivery.internal;

import java.util.Map;
import java.util.function.Function;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.web.reactive.function.client.WebClient;

import reactor.core.publisher.Mono;

/** Fontes de coordenadas por CEP (WebClient assincrono). A ordem dos beans e a ordem de tentativa. */
@Configuration(proxyBeanMethods = false)
class Geocoders {

    /** So o CEP sai do servidor (nunca nome, rua ou numero do cliente); user-agent generico. */
    static final String USER_AGENT = "MundoPet/1.0";

    @Bean
    @Order(1)
    Geocoder awesomeApi(WebClient.Builder builder, DeliveryProperties props) {
        return new HttpGeocoder("AwesomeAPI", client(builder, props.awesomeapiUrl()), props, HttpGeocoder::fromAwesomeApi);
    }

    @Bean
    @Order(2)
    Geocoder brasilApiV2(WebClient.Builder builder, DeliveryProperties props) {
        return new HttpGeocoder("BrasilAPI", client(builder, props.brasilapiUrl()), props, HttpGeocoder::fromBrasilApi);
    }

    private static WebClient client(WebClient.Builder builder, String baseUrl) {
        return builder.clone().baseUrl(baseUrl).defaultHeader("User-Agent", USER_AGENT).build();
    }

    static final class HttpGeocoder implements Geocoder {

        private final String name;
        private final WebClient client;
        private final DeliveryProperties props;
        private final Function<Map<String, Object>, GeoPoint> mapper;

        HttpGeocoder(String name, WebClient client, DeliveryProperties props, Function<Map<String, Object>, GeoPoint> mapper) {
            this.name = name;
            this.client = client;
            this.props = props;
            this.mapper = mapper;
        }

        @Override
        public String name() {
            return name;
        }

        @Override
        @SuppressWarnings("unchecked")
        public Mono<GeoPoint> locate(String cep) {
            return client.get().uri("/{cep}", cep)
                    .exchangeToMono(res -> {
                        if (res.statusCode() == HttpStatus.NOT_FOUND || res.statusCode() == HttpStatus.BAD_REQUEST) {
                            return res.releaseBody().then(Mono.<GeoPoint>empty());
                        }
                        if (res.statusCode().isError()) {
                            return res.createError();
                        }
                        return res.bodyToMono(Map.class).mapNotNull(body -> mapper.apply((Map<String, Object>) body));
                    })
                    .timeout(props.timeout());
        }

        /** {"lat":"-23.55","lng":"-46.63", ...} */
        static GeoPoint fromAwesomeApi(Map<String, Object> b) {
            return point(b.get("lat"), b.get("lng"));
        }

        /** {"location":{"coordinates":{"latitude":"-23.55","longitude":"-46.63"}}} (coordinates pode vir vazio). */
        @SuppressWarnings("unchecked")
        static GeoPoint fromBrasilApi(Map<String, Object> b) {
            if (b.get("location") instanceof Map<?, ?> loc && loc.get("coordinates") instanceof Map<?, ?> c) {
                Map<String, Object> coords = (Map<String, Object>) c;
                return point(coords.get("latitude"), coords.get("longitude"));
            }
            return null;
        }

        static GeoPoint point(Object lat, Object lng) {
            if (lat == null || lng == null) {
                return null;
            }
            try {
                double la = Double.parseDouble(lat.toString().strip());
                double lo = Double.parseDouble(lng.toString().strip());
                return GeoPoint.isValid(la, lo) ? new GeoPoint(la, lo) : null;
            } catch (NumberFormatException e) {
                return null;
            }
        }
    }
}
