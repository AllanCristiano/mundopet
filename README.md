# MundoPet

Monólito modular com escala horizontal até 6 réplicas, totalmente assíncrono.

```
                       ┌──────────────── docker compose ────────────────┐
 navegador ─┐          │                                                │
            ├─► nginx ─┼─► api ×1..6 (Spring WebFlux) ─┬─► Postgres (R2DBC, pool)
 APK ───────┘   :8088  │   ├ pets     (cadastro)       ├─► Redis (fila Streams + rate limit + caches)
                       │   ├ catalog  (rações/pedido)  └─► MinIO (objetos)
  SPA Angular servida  │   ├ address  (CEP)                             │
  pelo próprio nginx   │   ├ delivery (taxa por km)                     │
                       │   ├ beauty   (fotos/depoim.)                   │
                       │   ├ site     (gestão do site)                  │
                       │   ├ files    (MinIO)                           │
                       │   ├ queue    (jobs assíncronos)                │
                       │   └ shared   (erros, rate limit, admin)        │
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

O nginx serve a pasta `dist/` em **`/download/`**, então assim que o APK é gerado ele já aparece na landing
(seção "O MundoPet no seu bolso") como **Baixar para Android**, sem rebuild. Enquanto não existir, o botão mostra "em breve".

A URL da API embutida no APK vem de `MOBILE_API_URL` (padrão `http://10.0.2.2:8088`, o host visto pelo emulador).
Para celular físico use o IP da máquina na rede, ex.: `MOBILE_API_URL=http://192.168.0.10:8088`.

## Loja de rações (`/racoes`)

Catálogo com busca (ignora acentos), filtros (espécie, idade, porte, linha, marca, preço, só promoções), ordenação,
vitrine de ofertas com contagem regressiva e carrinho salvo no aparelho. O pedido vai para o **WhatsApp** da loja
como uma mensagem formatada (itens, quantidade, preço unitário "de/por", subtotais, descontos e total).

- Preços e totais são **recalculados no servidor** (`POST /api/catalog/cart/quote`); o navegador não define preço.
- Produtos de exemplo (marcas fictícias) vêm de `backend/src/main/resources/db/seed/R__catalog_seed.sql`.
  Em produção use `FLYWAY_LOCATIONS=classpath:db/migration` e cadastre os produtos reais.
- Número do WhatsApp: `WHATSAPP_PHONE` em `frontend/src/app/landing/landing.data.ts`.
- **Entrega**: o cliente digita o CEP e o endereço é preenchido sozinho (`GET /api/address/cep/{cep}`:
  ViaCEP → BrasilAPI de reserva, cache de 30 dias no Redis). Ele completa o número e pode corrigir qualquer campo.
  O endereço vai na mensagem com link do Google Maps e fica salvo no aparelho para a próxima compra.
- **Taxa de entrega por distância** (módulo `delivery`): `km até a loja × preço fixo por km`, somada ao total e
  mostrada no carrinho e na mensagem. O servidor localiza o CEP (AwesomeAPI → BrasilAPI v2, cache de 30 dias no Redis;
  só o CEP sai do servidor), mede a distância em linha reta × `DELIVERY_ROAD_FACTOR` (aproxima o caminho pelas ruas)
  e arredonda para cima em 0,1 km. Acima de `DELIVERY_MAX_KM` o envio é bloqueado (fora da área); se não der para
  localizar o CEP, a taxa vai como "a combinar". Configure no `.env`: `STORE_LAT`, `STORE_LNG`,
  `DELIVERY_PRICE_PER_KM`, `DELIVERY_MAX_KM`, `DELIVERY_ROAD_FACTOR`.

## Gestão do site (`/gestao`)

Página do dono para personalizar o site **sem programador e sem deploy** (mesmo token `ADMIN_TOKEN` da área da clínica):

| Seção | O que muda |
|---|---|
| Loja e contato | nome, WhatsApp (todos os botões e o pedido da loja), mensagem pronta, Instagram, Facebook, e-mail, texto do rodapé |
| Endereço e mapa | CEP com busca automática, rua, bairro, cidade, UF, coordenadas (cola do Google Maps) com prévia do mapa |
| Horários e aviso | horário da loja/clínica e um aviso no topo da página inicial (ex.: feriado) |
| Página inicial | título, destaque, textos da abertura e do convite final |
| Serviços | liga/desliga cada serviço (some da página e do menu), ordem, títulos, textos, destaques e botões |
| Números | até 4 números; "nota real" usa a média dos depoimentos aprovados |
| Entrega | preço por km e raio máximo (a taxa usa as coordenadas da loja acima) |

- Fica no Postgres (`site_settings`, JSONB validado pela API: links só `https://`, coordenadas no Brasil, tamanhos máximos).
- Duas pessoas editando ao mesmo tempo: quem salvar por último recebe "outra pessoa salvou antes" (versão), nada se perde em silêncio.
- O site lê a configuração ao abrir (espera no máximo 1,5 s; se a API falhar, usa os textos padrão de `landing.data.ts`).
- As réplicas da API guardam a configuração por 5 s; a entrega usa o `.env` (`STORE_LAT`, `DELIVERY_*`) só enquanto o dono não salvar.
- A seção "Quem conhece, volta" da landing mostra os **depoimentos reais aprovados** no Espaço Beleza.

## Espaço Beleza (`/beleza`)

Galeria de fotos dos pets atendidos (banho, tosa, hidratação, spa) com filtro por serviço e foto ampliada
(setas, teclado e arrastar no celular), mais os **depoimentos** dos tutores com nota média. A landing mostra uma
vitrine com as últimas fotos e depoimentos.

**Área da clínica: `/beleza/admin`** (não aparece no menu). Entra com o token `ADMIN_TOKEN` do `.env`
(mínimo 24 caracteres; gere com `openssl rand -hex 24`). Sem token configurado, a área fica desligada.
- **Fotos:** escolhe a foto no celular → preenche nome do pet, espécie e serviço → publica. A foto é reduzida no
  navegador (sobe rápido no 4G) e o servidor **valida e reprocessa**: só aceita JPG/PNG de verdade, recusa imagens
  gigantes, gera versão grande (1600 px) e miniatura (600 px) e **remove os metadados** (EXIF com GPS do celular).
  Os arquivos ficam no **MinIO** (`beauty/{id}/full.jpg|thumb.jpg`) e são servidos pela API com cache no nginx.
- **Depoimentos:** o que os clientes enviam pelo site entra **pendente**; a clínica aprova ou exclui. Elogio
  recebido no WhatsApp pode ser cadastrado direto (já aprovado). Anti-spam: 3 envios por IP por hora + campo-isca.
- Peça autorização ao tutor antes de publicar a foto do pet.

## Fila (chamadas assíncronas)

```bash
curl -X POST localhost:8088/api/jobs -H 'Content-Type: application/json' -d '{"type":"pet.created","payload":"<uuid>"}'
# 202 {"id":"..."}
curl localhost:8088/api/jobs/<id>     # QUEUED | RUNNING | DONE | FAILED
```

Falhas são reprocessadas até 3 vezes; depois vão para a stream `jobs:dlq`. Para criar um novo tipo de chamada,
implemente `JobHandler` no seu módulo.
