package br.com.mundopet.pets;

import java.time.LocalDate;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PastOrPresent;
import jakarta.validation.constraints.Size;

public record CreatePetRequest(
        @NotBlank @Size(max = 100) String name,
        @NotBlank @Size(max = 50) String species,
        @Size(max = 100) String breed,
        @PastOrPresent LocalDate birthDate) {
}
