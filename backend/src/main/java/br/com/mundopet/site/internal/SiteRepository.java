package br.com.mundopet.site.internal;

import java.time.OffsetDateTime;

import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Repository;

import reactor.core.publisher.Mono;

/** Linha unica (id = 1) com o JSON das configuracoes. */
@Repository
class SiteRepository {

    record Row(String json, int version, OffsetDateTime updatedAt) {
    }

    private final DatabaseClient db;

    SiteRepository(DatabaseClient db) {
        this.db = db;
    }

    Mono<Row> find() {
        return db.sql("SELECT data::text AS data, version, updated_at FROM site_settings WHERE id = 1")
                .map(r -> new Row(r.get("data", String.class), r.get("version", Integer.class),
                        r.get("updated_at", OffsetDateTime.class)))
                .one();
    }

    /**
     * Salva so se ninguem salvou antes (version confere). Vazio = conflito.
     * version 0 = primeira vez (ainda nao existe linha).
     */
    Mono<Row> save(String json, int expectedVersion) {
        String sql = expectedVersion == 0
                ? """
                  INSERT INTO site_settings (id, data, version) VALUES (1, CAST(:data AS jsonb), 1)
                  ON CONFLICT (id) DO NOTHING
                  RETURNING data::text AS data, version, updated_at"""
                : """
                  UPDATE site_settings SET data = CAST(:data AS jsonb), version = version + 1, updated_at = now()
                  WHERE id = 1 AND version = :version
                  RETURNING data::text AS data, version, updated_at""";
        var spec = db.sql(sql).bind("data", json);
        if (expectedVersion != 0) {
            spec = spec.bind("version", expectedVersion);
        }
        return spec.map(r -> new Row(r.get("data", String.class), r.get("version", Integer.class),
                r.get("updated_at", OffsetDateTime.class))).one();
    }
}
