# Contexto de build: raiz do projeto (ver docker-compose.yml)

# ---------- build do Angular ----------
FROM node:22-alpine AS frontend
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npx ng build --configuration production

# ---------- nginx: SPA + proxy reverso/balanceador da API ----------
FROM nginx:1.28-alpine
COPY infra/nginx/nginx.conf /etc/nginx/nginx.conf
COPY --from=frontend /app/dist/frontend/browser /usr/share/nginx/html
HEALTHCHECK --interval=10s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1/index.html >/dev/null || exit 1
