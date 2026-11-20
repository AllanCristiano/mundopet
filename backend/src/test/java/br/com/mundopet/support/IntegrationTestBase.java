package br.com.mundopet.support;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.reactive.server.WebTestClient;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.MinIOContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * Base dos testes de integracao: sobe Postgres, Redis e MinIO REAIS (Testcontainers) uma unica vez por JVM.
 * Regra do projeto: teste de integracao nunca usa mock de infraestrutura.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
// APIs de coordenadas apontam para uma porta fechada: os testes nunca dependem da internet
// (sem coordenadas a taxa fica "a combinar"). O DeliveryFeeIT troca por servidores falsos.
@TestPropertySource(properties = {
        "mundopet.rate-limit.requests-per-window=100000",
        "mundopet.delivery.awesomeapi-url=http://127.0.0.1:9",
        "mundopet.delivery.brasilapi-url=http://127.0.0.1:9" })
public abstract class IntegrationTestBase {

    public static final String MINIO_IMAGE = "pgsty/minio:RELEASE.2026-08-04T00-00-00Z";

    protected static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:17-alpine")
            .withDatabaseName("mundopet").withUsername("mundopet").withPassword("mundopet");

    protected static final GenericContainer<?> REDIS = new GenericContainer<>("redis:7.4-alpine").withExposedPorts(6379);

    protected static final MinIOContainer MINIO = new MinIOContainer(
            DockerImageName.parse(MINIO_IMAGE).asCompatibleSubstituteFor("minio/minio"))
            .withUserName("mundopet").withPassword("mundopet123");

    static {
        POSTGRES.start();
        REDIS.start();
        MINIO.start();
    }

    @Autowired
    protected WebTestClient web;

    @DynamicPropertySource
    static void infra(DynamicPropertyRegistry r) {
        String hostPort = POSTGRES.getHost() + ":" + POSTGRES.getMappedPort(5432);
        r.add("spring.r2dbc.url", () -> "r2dbc:postgresql://" + hostPort + "/mundopet");
        r.add("spring.r2dbc.username", POSTGRES::getUsername);
        r.add("spring.r2dbc.password", POSTGRES::getPassword);
        r.add("spring.flyway.url", POSTGRES::getJdbcUrl);
        r.add("spring.flyway.user", POSTGRES::getUsername);
        r.add("spring.flyway.password", POSTGRES::getPassword);
        r.add("spring.data.redis.host", REDIS::getHost);
        r.add("spring.data.redis.port", () -> REDIS.getMappedPort(6379));
        r.add("mundopet.minio.endpoint", MINIO::getS3URL);
        r.add("mundopet.minio.access-key", MINIO::getUserName);
        r.add("mundopet.minio.secret-key", MINIO::getPassword);
    }
}
