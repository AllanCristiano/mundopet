package br.com.mundopet.files.internal;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import br.com.mundopet.files.MinioProperties;
import io.minio.MinioAsyncClient;

@Configuration(proxyBeanMethods = false)
class MinioConfig {

    @Bean
    MinioAsyncClient minioAsyncClient(MinioProperties props) {
        return MinioAsyncClient.builder()
                .endpoint(props.endpoint())
                .credentials(props.accessKey(), props.secretKey())
                .build();
    }
}
