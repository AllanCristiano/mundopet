package br.com.mundopet.pets;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import org.springframework.data.annotation.Id;
import org.springframework.data.relational.core.mapping.Table;

@Table("pets")
public record Pet(@Id UUID id, String name, String species, String breed, LocalDate birthDate,
                  String photoKey, Instant createdAt) {

    public Pet withPhotoKey(String key) {
        return new Pet(id, name, species, breed, birthDate, key, createdAt);
    }
}
