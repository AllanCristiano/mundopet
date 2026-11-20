#!/usr/bin/env sh
# Escala a API entre 1 e 6 replicas. Uso: ./scripts/scale.sh 6
set -e
N="$1"
case "$N" in
  1|2|3|4|5|6) ;;
  *) echo "Uso: $0 <1-6>  (maximo de 6 replicas - ver RULES.md)" >&2; exit 1 ;;
esac
cd "$(dirname "$0")/.."
docker compose up -d --no-recreate --scale api="$N" api
echo "API escalada para $N replica(s). O nginx descobre as novas replicas em ate 10s."
docker compose ps api
