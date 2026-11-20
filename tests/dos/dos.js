// Teste contra negacao de servico na stack completa (nginx -> N replicas da API -> Postgres/Redis/MinIO).
// Executar: docker compose --profile dos run --rm k6
//
// Cenarios simultaneos:
//   attack  - um unico IP disparando 500 req/s na API (muito acima do limite)
//   legit   - cliente monitorando /health; precisa continuar respondendo rapido durante o ataque
// Criterios (thresholds) - o teste FALHA se qualquer um nao for atendido:
//   - nenhuma resposta 5xx / erro de conexao no ataque (o sistema barra com 429, nao cai)
//   - o rate limit atuou (houve 429)
//   - health continua UP: <1% de falha e p95 < 500ms
import http from 'k6/http';
import { check } from 'k6';
import { Rate, Counter } from 'k6/metrics';

const TARGET = __ENV.TARGET || 'http://nginx';
const DURATION = __ENV.DURATION || '30s';

const serverErrors = new Rate('server_errors');
const throttled = new Counter('throttled_429');

export const options = {
  scenarios: {
    attack: {
      executor: 'constant-arrival-rate',
      exec: 'attack',
      rate: Number(__ENV.ATTACK_RPS || 500),
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: 200,
      maxVUs: 1000,
    },
    legit: {
      executor: 'constant-arrival-rate',
      exec: 'legit',
      rate: 5,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: 5,
      maxVUs: 20,
    },
  },
  thresholds: {
    server_errors: ['rate<0.001'],
    throttled_429: ['count>0'],
    'http_req_failed{scenario:legit}': ['rate<0.01'],
    'http_req_duration{scenario:legit}': ['p(95)<500'],
  },
};

export function attack() {
  const res = http.get(`${TARGET}/api/pets?size=20`, {
    responseCallback: http.expectedStatuses(200, 429),
    timeout: '10s',
  });
  serverErrors.add(res.status === 0 || res.status >= 500);
  if (res.status === 429) throttled.add(1);
  check(res, { 'atendido ou barrado (200/429)': (r) => r.status === 200 || r.status === 429 });
}

export function legit() {
  const res = http.get(`${TARGET}/health`, { timeout: '5s' });
  check(res, { 'health UP': (r) => r.status === 200 });
}
