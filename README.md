# MundoPet

Monólito modular com escala horizontal até 6 réplicas, totalmente assíncrono.

```
                       ┌──────────────── docker compose ────────────────┐
 navegador ─┐          │                                                │
            ├─► nginx ─┼─► api ×1..6 (Spring WebFlux) ─┬─► Postgres (R2DBC, pool)
 APK ───────┘   :8088  │   ├ pets   (cadastro)         ├─► Redis (fila Streams + rate limit)
                       │   ├ files  (fotos)            └─► MinIO (objetos)
  SPA Angular servida  │   ├ queue  (jobs assíncronos)                  │
  pelo próprio nginx   │   └ shared (erros, rate limit)                 │
                       └────────────────────────────────────────────────┘
```

| Pasta | Conteúdo |
|---|---|
| `backend/` | Java 21, Spring Boot 3.5 WebFlux, Spring Modulith, R2DBC, Redis reativo, MinIO async |
| `frontend/` | Angular 20 (servido pelo nginx) |
| `mobile/` | Flutter (gera APK Android) |
| `infra/nginx/` | proxy reverso, balanceamento entre réplicas, rate limit |
| `tests/dos/` | teste de negação de serviço (k6) contra a stack completa |
| `scripts/` | escala da API (1–6 réplicas) |

**Regras obrigatórias: [RULES.md](RULES.md).**

## Subir

```bash
cp .env.example .env          # ajuste as senhas
docker compose up -d --build
```

- App: http://localhost:8088
- API: http://localhost:8088/api/pets
- Health: http://localhost:8088/health
- Console MinIO: http://localhost:9101

## Escalar (1 a 6 réplicas)

```powershell
./scripts/scale.ps1 6         # Windows
./scripts/scale.sh 6          # Linux/macOS
```

O nginx redescobre as réplicas pelo DNS do Docker em até 10 s. Cada réplica tem pool R2DBC de 5–20 conexões
(6 × 20 = 120 < `max_connections` 200) e é um consumidor do mesmo consumer group da fila, então o trabalho é dividido.
CPU/memória de cada réplica: `API_CPUS` / `API_MEMORY` no `.env`.

## Testes

```bash
cd backend  && ./mvnw verify                 # unit + falha + integração (Testcontainers) + DoS + cobertura ≥80% + módulos
cd frontend && npm run test:ci               # Karma headless + cobertura ≥80%
cd mobile   && flutter test --coverage

docker compose --profile dos run --rm k6     # DoS contra a stack completa (500 req/s por 30 s)
```

## APK

```bash
docker compose --profile mobile run --rm flutter-apk     # gera dist/mundopet.apk
```

A URL da API embutida no APK vem de `MOBILE_API_URL` (padrão `http://10.0.2.2:8088`, o host visto pelo emulador).
Para celular físico use o IP da máquina na rede, ex.: `MOBILE_API_URL=http://192.168.0.10:8088`.

## Fila (chamadas assíncronas)

```bash
curl -X POST localhost:8088/api/jobs -H 'Content-Type: application/json' -d '{"type":"pet.created","payload":"<uuid>"}'
# 202 {"id":"..."}
curl localhost:8088/api/jobs/<id>     # QUEUED | RUNNING | DONE | FAILED
```

Falhas são reprocessadas até 3 vezes; depois vão para a stream `jobs:dlq`. Para criar um novo tipo de chamada,
implemente `JobHandler` no seu módulo.
