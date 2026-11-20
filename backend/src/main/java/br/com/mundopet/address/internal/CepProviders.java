package br.com.mundopet.address.internal;

import java.util.Map;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.web.reactive.function.client.WebClient;

import br.com.mundopet.address.Address;
import reactor.core.publisher.Mono;

/** Fontes de CEP (HTTP assincrono com WebClient). A ordem dos beans define a ordem de tentativa. */
@Configuration(proxyBeanMethods = false)
class CepProviders {

    /** Nao enviamos nada do cliente alem do CEP; user-agent generico. */
    static final String USER_AGENT = "MundoPet/1.0";

    @Bean
    @Order(1)
    CepProvider viaCep(WebClient.Builder builder, AddressProperties props) {
        return new HttpCepProvider("ViaCEP", builder.baseUrl(props.viacepUrl()).defaultHeader("User-Agent", USER_AGENT).build(),
                props, cep -> "/" + cep + "/json/", HttpCepProvider::fromViaCep);
    }

    @Bean
    @Order(2)
    CepProvider brasilApi(WebClient.Builder builder, AddressProperties props) {
        return new HttpCepProvider("BrasilAPI", builder.baseUrl(props.brasilapiUrl()).defaultHeader("User-Agent", USER_AGENT).build(),
                props, cep -> "/" + cep, HttpCepProvider::fromBrasilApi);
    }

    static final class HttpCepProvider implements CepProvider {

        interface Mapper {
            Address map(Map<String, Object> body, String cep, String source);
        }

        interface PathBuilder {
            String path(String cep);
        }

        private final String name;
        private final WebClient client;
        private final AddressProperties props;
        private final PathBuilder path;
        private final Mapper mapper;

        HttpCepProvider(String name, WebClient client, AddressProperties props, PathBuilder path, Mapper mapper) {
            this.name = name;
            this.client = client;
            this.props = props;
            this.path = path;
            this.mapper = mapper;
        }

        @Override
        public String name() {
            return name;
        }

        @Override
        @SuppressWarnings("unchecked")
        public Mono<Address> find(String cep) {
            return client.get().uri(path.path(cep))
                    .exchangeToMono(res -> {
                        if (res.statusCode() == HttpStatus.NOT_FOUND || res.statusCode() == HttpStatus.BAD_REQUEST) {
                            return res.releaseBody().then(Mono.<Address>empty());
                        }
                        if (res.statusCode().isError()) {
                            return res.createError();
                        }
                        return res.bodyToMono(Map.class)
                                .mapNotNull(body -> mapper.map((Map<String, Object>) body, cep, name));
                    })
                    .timeout(props.timeout());
        }

        /** ViaCEP responde 200 com {"erro": true} (ou "true") quando o CEP nao existe. */
        static Address fromViaCep(Map<String, Object> b, String cep, String source) {
            if (b.containsKey("erro")) {
                return null;
            }
            return new Address(Address.formatCep(cep), str(b, "logradouro"), str(b, "bairro"), str(b, "localidade"),
                    str(b, "uf"), source);
        }

        static Address fromBrasilApi(Map<String, Object> b, String cep, String source) {
            return new Address(Address.formatCep(cep), str(b, "street"), str(b, "neighborhood"), str(b, "city"),
                    str(b, "state"), source);
        }

        private static String str(Map<String, Object> b, String key) {
            Object v = b.get(key);
            return v == null ? "" : v.toString().strip();
        }
    }
}
