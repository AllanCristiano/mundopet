# MundoPet

Monólito modular: Java 21 / Spring Boot 3.5 WebFlux (`backend/`), Angular 20 (`frontend/`), Flutter APK (`mobile/`),
Postgres (R2DBC), Redis (fila via Streams + rate limit), MinIO, nginx. Tudo orquestrado por `docker-compose.yml`.

**Siga sempre o [RULES.md](RULES.md).** Em especial:
- Nada bloqueante no backend; Postgres só via R2DBC.
- Módulos só se falam pela API pública (pacote raiz); `internal` é privado. `ModularityTest` verifica.
- Todo módulo novo/alterado precisa de testes unitários, de falha e de integração (Testcontainers), com cobertura ≥ 80%.
- Não remover nenhuma camada anti-DoS; o `DenialOfServiceIT` e o `tests/dos/dos.js` precisam continuar passando.
- API escala até 6 réplicas: mantenha-a stateless e respeite o orçamento de conexões (pool × 6 < max_connections).
- Frontend é MOBILE FIRST (CSS base = celular, desktop só via `min-width`) e a landing é cheia de animação,
  mas só `transform`/`opacity`, com `prefers-reduced-motion` respeitado. Use as diretivas em `frontend/src/app/landing/motion/`.
- Landing: `/`. Textos, contatos, serviços, números e entrega são editados pelo dono em `/gestao` (módulo `site`);
  `landing/landing.data.ts` só tem os textos PADRÃO. Componentes leem do `SiteConfigService` (nunca de constantes).
- Espaço Beleza: `/beleza` (área da clínica `/beleza/admin`); loja: `/racoes`; painel de pets: `/pets`.

Comandos:
- Backend: `cd backend && ./mvnw verify` (precisa do Docker rodando). No Windows, `JAVA_HOME` deve apontar para a pasta do JDK, sem aspas e sem `\bin`.
- Frontend: `cd frontend && npm run test:ci`
- Mobile: `cd mobile && flutter test --coverage`
- Stack: `docker compose up -d --build`; escala: `./scripts/scale.ps1 6`; DoS: `docker compose --profile dos run --rm k6`
