package br.com.mundopet.files;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("mundopet.minio")
public record MinioProperties(String endpoint, String accessKey, String secretKey, String bucket) {
}
