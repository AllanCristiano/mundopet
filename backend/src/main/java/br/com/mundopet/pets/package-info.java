/**
 * Modulo de pets: cadastro (Postgres via R2DBC), foto (modulo files) e eventos na fila (modulo queue).
 * API publica: {@link br.com.mundopet.pets.PetService}, {@link br.com.mundopet.pets.Pet}.
 */
@org.springframework.modulith.ApplicationModule(displayName = "Pets")
package br.com.mundopet.pets;
