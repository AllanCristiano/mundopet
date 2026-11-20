package br.com.mundopet.address.internal;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("mundopet.address")
record AddressProperties(String viacepUrl, String brasilapiUrl, Duration timeout, Duration cacheTtl) {
    AddressProperties {
        if (viacepUrl == null) viacepUrl = "https://viacep.com.br/ws";
        if (brasilapiUrl == null) brasilapiUrl = "https://brasilapi.com.br/api/cep/v1";
        if (timeout == null) timeout = Duration.ofSeconds(3);
        if (cacheTtl == null) cacheTtl = Duration.ofDays(30);
    }
}
