package br.com.mundopet;

import org.junit.jupiter.api.Test;
import org.springframework.modulith.core.ApplicationModules;
import org.springframework.modulith.docs.Documenter;

/** Garante as fronteiras do monolito modular: sem ciclos e sem acesso a pacotes internal de outro modulo. */
class ModularityTest {

    private final ApplicationModules modules = ApplicationModules.of(MundoPetApplication.class);

    @Test
    void modulesRespectBoundaries() {
        modules.verify();
    }

    @Test
    void writeModuleDocs() {
        new Documenter(modules).writeModulesAsPlantUml().writeIndividualModulesAsPlantUml();
    }
}
