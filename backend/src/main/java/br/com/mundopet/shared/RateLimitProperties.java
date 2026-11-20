package br.com.mundopet.shared;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Rate limit distribuido (compartilhado entre todas as replicas via Redis).
 * @param requestsPerWindow maximo de requisicoes por IP dentro da janela
 * @param windowSeconds tamanho da janela fixa em segundos
 */
@ConfigurationProperties("mundopet.rate-limit")
public record RateLimitProperties(boolean enabled, long requestsPerWindow, long windowSeconds) {
    public RateLimitProperties {
        if (requestsPerWindow <= 0) requestsPerWindow = 100;
        if (windowSeconds <= 0) windowSeconds = 1;
    }
}
