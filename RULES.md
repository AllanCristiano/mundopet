# Regras do projeto MundoPet

Estas regras são **obrigatórias**. Um PR que viole qualquer item marcado com **[BLOQUEANTE]** não pode ser mergeado.

---

## 1. Arquitetura — monólito modular

1.1 **[BLOQUEANTE]** O backend é **um único deployable** (`backend/`) dividido em módulos por domínio. Cada módulo é um pacote direto de `br.com.mundopet` (`pets`, `files`, `queue`, ...).

1.2 **[BLOQUEANTE]** A API pública de um módulo é **somente** o que está no pacote raiz dele. Tudo que está em `<modulo>.internal` é privado: outro módulo **não pode** importar.

1.3 **[BLOQUEANTE]** Não pode haver dependência cíclica entre módulos. Ambas as regras (1.2 e 1.3) são verificadas automaticamente pelo `ModularityTest` (Spring Modulith).

1.4 Comunicação entre módulos: chamada à interface pública (síncrona/reativa) **ou** job na fila (`queue.JobQueue`) quando o trabalho puder ser feito depois. Prefira a fila para tudo que não precisa estar pronto na resposta HTTP.

1.5 O módulo `shared` contém só infraestrutura transversal (erros, rate limit). Regra de negócio **nunca** vai em `shared`.

1.6 Cada módulo é dono das próprias tabelas. Um módulo **não** consulta tabela de outro módulo — usa a API pública dele.

1.7 Novo módulo = novo pacote + `package-info.java` com `@ApplicationModule` + testes (seção 3) no mesmo PR.

## 2. Assíncrono e conexões

2.1 **[BLOQUEANTE]** O backend é **reativo (WebFlux)**. É proibido bloquear threads do event loop: nada de `.block()`, `Thread.sleep`, JDBC, ou I/O bloqueante em código de produção.

2.2 **[BLOQUEANTE]** Postgres é acessado **somente via R2DBC** (assíncrono) com pool. JDBC só é permitido para o Flyway na inicialização.

2.3 Se uma biblioteca só oferece API bloqueante, ela deve ser isolada com `subscribeOn/publishOn(Schedulers.boundedElastic())`. Sempre prefira a versão assíncrona do cliente (ex.: `MinioAsyncClient`, Lettuce reativo).

2.4 **[BLOQUEANTE]** Orçamento de conexões com o banco: `DB_POOL_MAX × 6 réplicas` deve ser **menor** que `max_connections` do Postgres (hoje 20 × 6 = 120 < 200). Quem aumentar o pool ou o número de réplicas atualiza `max_connections` no mesmo PR.

2.5 Toda chamada externa (DB, Redis, MinIO, HTTP) tem **timeout** explícito. Nenhuma chamada pode esperar para sempre.

2.6 Operações lentas, que dependem de terceiros ou que podem ser reprocessadas vão para a **fila do Redis** (`JobQueue.enqueue`) e a API responde `202 Accepted` com o id do job.

2.7 Todo `JobHandler` deve ser **idempotente** (o mesmo job pode ser entregue mais de uma vez) e ter no máximo `job-timeout` de duração.

## 3. Testes — cobertura contra falha e integração

3.1 **[BLOQUEANTE]** Todo módulo (backend, frontend e mobile) precisa ter os três tipos de teste:

| Tipo | O que prova | Backend | Angular | Flutter |
|---|---|---|---|---|
| **Unitário** | regra de negócio | `*Test.java` | `*.spec.ts` | `test/*_test.dart` |
| **Falha** | comportamento quando uma dependência cai, demora, devolve erro ou recebe entrada inválida | `*Test.java` com mocks falhando | specs com `HttpTestingController` devolvendo 0/429/503 | `MockClient` devolvendo erro/timeout |
| **Integração** | funciona com a infraestrutura **real** | `*IT.java` com Testcontainers (Postgres, Redis, MinIO) | — (coberto pelo backend + E2E futuro) | — |

3.2 **[BLOQUEANTE]** Testes de falha mínimos para **cada** dependência externa usada pelo módulo:
- dependência fora do ar (conexão recusada);
- dependência lenta (timeout);
- resposta de erro / dado inválido;
- entrada inválida do usuário (400, nunca 500).

3.3 **[BLOQUEANTE]** Teste de integração **não** usa mock de infraestrutura. Usa os containers da `IntegrationTestBase`.

3.4 **[BLOQUEANTE]** Cobertura mínima de linhas: **80% por pacote** no backend (gate do JaCoCo no `mvn verify`), **80%** no Angular (gate do karma-coverage) e **80%** no Flutter.

3.5 Testes não podem depender de ordem nem de estado global compartilhado (use dados/streams próprios por teste).

## 4. Proteção contra negação de serviço

4.1 **[BLOQUEANTE]** A aplicação deve ter teste contra DoS, e ele deve passar antes de qualquer release:
- `backend/src/test/java/br/com/mundopet/dos/DenialOfServiceIT.java` — roda no `mvn verify`;
- `tests/dos/dos.js` (k6) — contra a stack completa: `docker compose --profile dos run --rm k6`.

4.2 Critérios do teste de DoS (o teste falha se algum não for atendido):
- rajada de um IP é barrada com **429**, nunca com 5xx ou queda de conexão;
- durante o ataque o `/health` responde com **< 1% de erro e p95 < 500 ms**;
- payload acima do limite é recusado sem estourar memória.

4.3 Defesa em camadas — nenhuma pode ser removida:
1. **nginx**: `limit_req` (30 r/s por IP, burst 60), `limit_conn` (50 por IP), timeouts contra slowloris, `client_max_body_size 5m`;
2. **API**: `RateLimitFilter` distribuído no Redis (vale para todas as réplicas juntas), limites de payload (`max-in-memory-size`), paginação com `size ≤ 100`;
3. **Recursos**: limites de CPU/memória por container, pool de conexões limitado, fila em vez de processamento síncrono.

4.4 O rate limit da API **falha aberto** (se o Redis cair, deixa passar) para não derrubar o sistema inteiro; o nginx continua protegendo.

4.5 A API confia no header `X-Real-IP` **somente** porque ela não é exposta para fora: todo tráfego externo passa pelo nginx, que sobrescreve esse header. Nunca publique a porta da API diretamente.

4.6 Todo endpoint novo de listagem precisa ter paginação com limite máximo. Todo upload precisa de limite de tamanho e lista de tipos permitidos.

## 5. Docker e escala

5.1 **[BLOQUEANTE]** A stack inteira sobe com um comando: `docker compose up -d --build`.

5.2 **[BLOQUEANTE]** A API escala de **1 a 6 réplicas** (`./scripts/scale.ps1 N` ou `./scripts/scale.sh N`). Nunca mais que 6. Cada réplica tem limite de CPU/memória (`API_CPUS`, `API_MEMORY`) — a escala vertical é feita ajustando esses limites.

5.3 A API deve ser **stateless**: nada de estado em memória que precise ser compartilhado entre réplicas (sessão, cache, contador). Isso vai para Redis ou Postgres.

5.4 Migrations (Flyway) devem ser seguras com várias réplicas subindo juntas e **retrocompatíveis** com a versão anterior da aplicação (deploy gradual).

5.5 O serviço `api` não tem `container_name` nem porta publicada (são incompatíveis com múltiplas réplicas).

5.6 Toda imagem tem **tag fixa** (nada de `latest` para imagens de terceiros) e healthcheck.

5.7 O Redis roda com `maxmemory-policy noeviction`: mensagens da fila nunca podem ser descartadas.

## 6. Segurança e configuração

6.1 **[BLOQUEANTE]** Nenhum segredo no código. Tudo vem de variável de ambiente (`.env`, que **não** é commitado; o modelo é o `.env.example`).

6.2 Erros para o cliente seguem `application/problem+json` e nunca expõem stack trace ou detalhes internos.

6.3 `/actuator/*` não é exposto pelo nginx (só `/health`).

6.4 O APK de desenvolvimento permite HTTP (`usesCleartextTraffic`). **Release para loja exige HTTPS** e remoção desse atributo.

## 7. Fluxo de trabalho

7.1 Antes de abrir PR rode:
```
backend:   ./mvnw verify                                  (unit + falha + integração + DoS + cobertura + módulos)
frontend:  npm run test:ci                                (com cobertura mínima)
mobile:    flutter analyze && flutter test --coverage
stack:     docker compose up -d --build && docker compose --profile dos run --rm k6
```
7.2 Commits pequenos, mensagem no imperativo, um assunto por PR.
7.3 Bug corrigido = teste que reproduz o bug no mesmo PR.

## 8. Mobile first e animação

8.1 **[BLOQUEANTE]** Toda tela é desenhada e codada **primeiro para o celular** (base de 360px). O CSS base é o do celular; telas maiores entram **somente** com `@media (min-width: ...)`. É proibido usar `max-width` em media query para "consertar" o mobile.

8.2 **[BLOQUEANTE]** Nenhuma página pode ter rolagem horizontal em 360px. Verificar em **360px, 390px, 768px e 1440px** antes do PR.

8.3 Área de toque mínima de **48×48px** (botões, links de menu, ícones clicáveis). Textos com no mínimo 16px no corpo. Respeitar `env(safe-area-inset-*)` em elementos fixos.

8.4 Use unidades de viewport dinâmicas (`svh`/`dvh`) em vez de `vh` para seções de tela cheia no celular (a barra do navegador muda de altura).

8.5 **[BLOQUEANTE]** As páginas públicas (landing) devem ser **ricas em animação** para despertar a vontade de conhecer a loja: entrada do conteúdo ao rolar (`appReveal`), cenas guiadas pelo scroll (`appScrollProgress`), contadores (`appCountUp`) e microinterações. Mas animar **só `transform` e `opacity`** (e `filter`/`clip-path` com moderação). Nunca animar `width`, `height`, `top`, `left`, `margin` (causam re-layout e travam no celular).

8.6 **[BLOQUEANTE]** Respeitar `prefers-reduced-motion`: com a preferência ativa, nada de parallax nem loop infinito, e o conteúdo aparece direto. Nenhum conteúdo pode depender da animação para ficar visível (se o `IntersectionObserver` não existir, o conteúdo aparece).

8.7 Listeners de scroll são `passive`, rodam **fora da zona do Angular** e atualizam no máximo uma vez por frame (`requestAnimationFrame`). Animação guiada por scroll escreve variáveis CSS (`--p`, `data-step`), sem disparar change detection.

8.8 Desempenho no celular: a landing deve ficar abaixo de **150 kB comprimidos** de JS inicial + rota, e as imagens novas devem ser `webp/avif` com `loading="lazy"` (exceto a primeira dobra).

8.9 **[BLOQUEANTE]** Toda tela suporta **tema claro e escuro**. Cores só via tokens CSS (`--bg`, `--ink`, `--muted`, `--line`, `--gold`, `--glass`…) definidos em `styles.scss`; é proibido cor fixa (hex/rgba) que dependa do tema dentro de componentes. Verificar as duas variações antes do PR. O tema segue: escolha salva > preferência do sistema > escuro.

8.10 Link para arquivo (ex.: APK em `/download/`) só é exibido como clicável se o arquivo existir de fato; senão o botão mostra "em breve" (nunca link quebrado).

8.11 Ilustrações decorativas usam `aria-hidden="true"`; as que comunicam algo têm `role="img"` + `aria-label`. Hierarquia de títulos: um único `h1` por página.
