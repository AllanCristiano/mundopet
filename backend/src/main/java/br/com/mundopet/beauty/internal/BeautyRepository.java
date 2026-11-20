package br.com.mundopet.beauty.internal;

import java.time.OffsetDateTime;
import java.util.UUID;

import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Repository;

import br.com.mundopet.beauty.internal.BeautyTypes.Photo;
import br.com.mundopet.beauty.internal.BeautyTypes.Service;
import br.com.mundopet.beauty.internal.BeautyTypes.Species;
import br.com.mundopet.beauty.internal.BeautyTypes.Status;
import br.com.mundopet.beauty.internal.BeautyTypes.Summary;
import br.com.mundopet.beauty.internal.BeautyTypes.Testimonial;
import io.r2dbc.spi.Readable;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/** SQL explicito via R2DBC (assincrono); tudo que vem de fora entra por bind parameter. */
@Repository
class BeautyRepository {

    private final DatabaseClient db;

    BeautyRepository(DatabaseClient db) {
        this.db = db;
    }

    // ---------------- Fotos ----------------

    Mono<Photo> insertPhoto(Photo p) {
        var spec = db.sql("""
                        INSERT INTO beauty_photos (id, pet_name, species, service, caption, width, height)
                        VALUES (:id, :petName, :species, :service, :caption, :width, :height)
                        RETURNING *""")
                .bind("id", p.id()).bind("petName", p.petName()).bind("species", p.species().name())
                .bind("service", p.service().name()).bind("width", p.width()).bind("height", p.height());
        spec = p.caption() == null ? spec.bindNull("caption", String.class) : spec.bind("caption", p.caption());
        return spec.map(BeautyRepository::photo).one();
    }

    /** Busca limit+1 para saber se ha proxima pagina sem um COUNT(*). */
    Flux<Photo> photos(Service service, int limit, long offset) {
        String where = service == null ? "" : " WHERE service = :service";
        var spec = db.sql("SELECT * FROM beauty_photos" + where + " ORDER BY created_at DESC, id DESC LIMIT :limit OFFSET :offset")
                .bind("limit", limit).bind("offset", offset);
        if (service != null) {
            spec = spec.bind("service", service.name());
        }
        return spec.map(BeautyRepository::photo).all();
    }

    Mono<Long> deletePhoto(UUID id) {
        return db.sql("DELETE FROM beauty_photos WHERE id = :id").bind("id", id).fetch().rowsUpdated();
    }

    // ---------------- Depoimentos ----------------

    Mono<Testimonial> insertTestimonial(Testimonial t) {
        var spec = db.sql("""
                        INSERT INTO beauty_testimonials (id, author, pet_name, rating, message, status, approved_at)
                        VALUES (:id, :author, :petName, :rating, :message, :status, :approvedAt)
                        RETURNING *""")
                .bind("id", t.id()).bind("author", t.author()).bind("rating", t.rating())
                .bind("message", t.message()).bind("status", t.status().name());
        spec = t.status() == Status.APPROVED ? spec.bind("approvedAt", OffsetDateTime.now())
                : spec.bindNull("approvedAt", OffsetDateTime.class);
        spec = t.petName() == null ? spec.bindNull("petName", String.class) : spec.bind("petName", t.petName());
        return spec.map(BeautyRepository::testimonial).one();
    }

    Flux<Testimonial> testimonials(Status status, int limit, long offset) {
        String order = status == Status.APPROVED ? "approved_at DESC, id DESC" : "created_at ASC, id";
        return db.sql("SELECT * FROM beauty_testimonials WHERE status = :status ORDER BY " + order + " LIMIT :limit OFFSET :offset")
                .bind("status", status.name()).bind("limit", limit).bind("offset", offset)
                .map(BeautyRepository::testimonial).all();
    }

    Mono<Summary> summary() {
        return db.sql("SELECT coalesce(avg(rating), 0)::float8 AS avg, count(*) AS n FROM beauty_testimonials WHERE status = 'APPROVED'")
                .map(r -> new Summary(Math.round(r.get("avg", Double.class) * 10) / 10.0, r.get("n", Long.class)))
                .one();
    }

    Mono<Long> approve(UUID id) {
        return db.sql("UPDATE beauty_testimonials SET status = 'APPROVED', approved_at = now() WHERE id = :id AND status = 'PENDING'")
                .bind("id", id).fetch().rowsUpdated();
    }

    Mono<Long> deleteTestimonial(UUID id) {
        return db.sql("DELETE FROM beauty_testimonials WHERE id = :id").bind("id", id).fetch().rowsUpdated();
    }

    // ---------------- Mapeamento ----------------

    static Photo photo(Readable r) {
        return new Photo(r.get("id", UUID.class), r.get("pet_name", String.class), Species.valueOf(r.get("species", String.class)),
                Service.valueOf(r.get("service", String.class)), r.get("caption", String.class), r.get("width", Integer.class),
                r.get("height", Integer.class), r.get("created_at", OffsetDateTime.class));
    }

    static Testimonial testimonial(Readable r) {
        return new Testimonial(r.get("id", UUID.class), r.get("author", String.class), r.get("pet_name", String.class),
                r.get("rating", Integer.class), r.get("message", String.class), Status.valueOf(r.get("status", String.class)),
                r.get("created_at", OffsetDateTime.class));
    }
}
