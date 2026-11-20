package br.com.mundopet.site.internal;

import java.math.BigDecimal;
import java.util.HashSet;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonIgnore;

import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Tudo que o dono pode personalizar no site. Validado na API antes de salvar:
 * links so https (nada de "javascript:"), coordenadas no Brasil, textos com tamanho maximo.
 */
record SiteSettings(
        @NotNull @Valid Store store,
        @NotNull @Valid Address address,
        @NotNull @Valid Hours hours,
        @NotNull @Valid Announcement announcement,
        @NotNull @Valid Hero hero,
        @NotNull @Valid Cta cta,
        @NotNull @Size(min = 4, max = 4) List<@Valid @NotNull Chapter> chapters,
        @NotNull @Size(min = 1, max = 4) List<@Valid @NotNull Stat> stats,
        @NotNull @Valid Delivery delivery) {

    static final String HTTPS_OR_EMPTY = "^$|^https://[^\\s<>\"']{3,200}$";

    /** Os 4 capitulos (hotel, racoes, beleza, veterinario) aparecem uma vez cada. */
    @JsonIgnore
    @AssertTrue(message = "os servicos devem ser hotel, racoes, beleza e veterinario, uma vez cada")
    boolean isChaptersUnique() {
        return chapters == null || new HashSet<>(chapters.stream().map(Chapter::id).toList()).size() == chapters.size();
    }

    record Store(
            @NotBlank @Size(max = 40) String name,
            @Size(max = 220) String about,
            @NotBlank @Pattern(regexp = "\\d{10,15}", message = "WhatsApp: só números com DDI e DDD (ex.: 5511999998888)") String whatsapp,
            @Size(max = 200) String whatsappMessage,
            @NotNull @Pattern(regexp = HTTPS_OR_EMPTY, message = "Instagram: use um link https://") String instagram,
            @NotNull @Pattern(regexp = HTTPS_OR_EMPTY, message = "Facebook: use um link https://") String facebook,
            @Email @Size(max = 80) String email) {
    }

    record Address(
            @NotBlank @Size(max = 120) String street,
            @Size(max = 60) String district,
            @NotBlank @Size(max = 60) String city,
            @NotBlank @Pattern(regexp = "[A-Za-z]{2}", message = "UF inválida") String state,
            @NotBlank @Pattern(regexp = "\\d{5}-?\\d{3}", message = "CEP inválido") String zip,
            @DecimalMin("-34.5") @DecimalMax("6") double lat,
            @DecimalMin("-75") @DecimalMax("-28") double lng,
            @Size(max = 160) String mapsQuery) {
    }

    record Hours(@NotBlank @Size(max = 80) String store, @Size(max = 80) String clinic) {
    }

    record Announcement(boolean enabled, @Size(max = 140) String text) {

        @JsonIgnore
        @AssertTrue(message = "aviso ligado precisa de um texto")
        boolean isTextPresentWhenEnabled() {
            return !enabled || (text != null && !text.isBlank());
        }
    }

    record Hero(@Size(max = 60) String kicker, @NotBlank @Size(max = 80) String title, @Size(max = 30) String highlight,
                @Size(max = 240) String subtitle) {
    }

    record Cta(@Size(max = 60) String kicker, @NotBlank @Size(max = 40) String title, @Size(max = 30) String highlight,
               @Size(max = 240) String text) {
    }

    record Chapter(
            @NotBlank @Pattern(regexp = "hotel|racoes|beleza|veterinario") String id,
            boolean enabled,
            @Size(max = 40) String kicker,
            @NotBlank @Size(max = 40) String title,
            @Size(max = 30) String highlight,
            @Size(max = 300) String text,
            @NotNull @Size(max = 6) List<@NotBlank @Size(max = 60) String> features,
            @NotBlank @Size(max = 40) String cta) {
    }

    enum StatSource { MANUAL, RATING }

    /** Numero da secao "Quem conhece, volta". RATING = nota media real dos depoimentos aprovados. */
    record Stat(
            @NotBlank @Size(max = 40) String label,
            @DecimalMin("0") @DecimalMax("1000000000") double value,
            @Size(max = 6) String prefix,
            @Size(max = 8) String suffix,
            @Min(0) @Max(2) int decimals,
            @NotNull StatSource source) {
    }

    record Delivery(
            @NotNull @DecimalMin("0") @DecimalMax("100") BigDecimal pricePerKm,
            @NotNull @DecimalMin("0.5") @DecimalMax("100") BigDecimal maxKm) {
    }
}
