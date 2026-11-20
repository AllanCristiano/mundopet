package br.com.mundopet.beauty.internal;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Tipos do Espaco Beleza. */
final class BeautyTypes {

    private BeautyTypes() {
    }

    enum Species { CAO, GATO, OUTRO }

    enum Service { BANHO, TOSA, BANHO_TOSA, HIDRATACAO, SPA, OUTRO }

    enum Status { PENDING, APPROVED }

    enum Variant {
        THUMB("thumb"), FULL("full");

        final String path;

        Variant(String path) {
            this.path = path;
        }

        static Variant of(String raw) {
            for (Variant v : values()) {
                if (v.path.equals(raw)) {
                    return v;
                }
            }
            throw new IllegalArgumentException("Variante invalida: use thumb ou full");
        }
    }

    record Photo(UUID id, String petName, Species species, Service service, String caption, int width, int height,
                 OffsetDateTime createdAt) {

        /** Caminhos servidos pela API (o navegador nunca fala direto com o MinIO). */
        public String getThumbUrl() {
            return "/api/beauty/photos/" + id + "/thumb";
        }

        public String getFullUrl() {
            return "/api/beauty/photos/" + id + "/full";
        }

        static String objectKey(UUID id, Variant variant) {
            return "beauty/" + id + "/" + variant.path + ".jpg";
        }
    }

    record PhotoPage(List<Photo> items, int page, int size, boolean hasMore) {
    }

    /** Dados que a clinica preenche junto com a foto. */
    record PhotoForm(String petName, Species species, Service service, String caption) {

        static PhotoForm of(String petName, String species, String service, String caption) {
            String name = BeautyTypes.clean(petName);
            if (name.isEmpty() || name.length() > 40) {
                throw new IllegalArgumentException("Informe o nome do pet (até 40 caracteres)");
            }
            String cap = BeautyTypes.clean(caption);
            if (cap.length() > 160) {
                throw new IllegalArgumentException("Legenda muito longa (até 160 caracteres)");
            }
            return new PhotoForm(name, parse(Species.class, species, Species.CAO), parse(Service.class, service, Service.BANHO_TOSA),
                    cap.isEmpty() ? null : cap);
        }

        private static <E extends Enum<E>> E parse(Class<E> type, String raw, E fallback) {
            if (raw == null || raw.isBlank()) {
                return fallback;
            }
            try {
                return Enum.valueOf(type, raw.strip().toUpperCase());
            } catch (IllegalArgumentException e) {
                throw new IllegalArgumentException("Valor invalido: " + raw);
            }
        }
    }

    record Testimonial(UUID id, String author, String petName, int rating, String message, Status status,
                       OffsetDateTime createdAt) {
    }

    record TestimonialPage(List<Testimonial> items, int page, int size, boolean hasMore, Summary summary) {
    }

    record Summary(double average, long count) {
    }

    /** Depoimento enviado pelo site. "website" e um campo-isca invisivel: so robo preenche. */
    record NewTestimonial(
            @NotBlank @Size(max = 60) String author,
            @Size(max = 40) String petName,
            @Min(1) @Max(5) int rating,
            @NotBlank @Size(min = 10, max = 600) String message,
            String website) {

        boolean isBot() {
            return website != null && !website.isBlank();
        }
    }

    /** Remove caracteres de controle e espacos repetidos. Quebras de linha viram espaco. */
    static String clean(String value) {
        return value == null ? "" : value.replaceAll("\\p{Cntrl}", " ").replaceAll("\\s+", " ").strip();
    }

    /** Mantem quebras de linha (no maximo 2 seguidas) para o texto do depoimento. */
    static String cleanMultiline(String value) {
        if (value == null) {
            return "";
        }
        String s = value.replace("\r\n", "\n").replaceAll("[\\p{Cntrl}&&[^\n]]", " ");
        s = s.replaceAll("[ \\t]+", " ").replaceAll(" ?\n ?", "\n").replaceAll("\n{3,}", "\n\n");
        return s.strip();
    }
}
