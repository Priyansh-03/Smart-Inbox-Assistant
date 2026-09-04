#!/usr/bin/env bash
# Single entry point. Resolves the env file, then runs a command.
#   ./run.sh <cmd> [args]           -> .env        (production)
#   ./run.sh -local <cmd> [args]    -> .env.local  (localhost)
# Any trailing args pass through to the underlying tool and override the env file.
set -euo pipefail
cd "$(dirname "$0")"

ENV_FILE=.env
if [ "${1:-}" = "-local" ]; then ENV_FILE=.env.local; shift; fi
[ -f "$ENV_FILE" ] || { echo "run.sh: missing $ENV_FILE" >&2; exit 1; }

cmd="${1:-}"; shift || true

load_env() { set -a; . "./$ENV_FILE"; set +a; }

case "$cmd" in
  up)       exec docker compose --env-file "$ENV_FILE" up --build -d "$@" ;;
  down)     exec docker compose --env-file "$ENV_FILE" down "$@" ;;
  logs)     exec docker compose --env-file "$ENV_FILE" logs -f "$@" ;;
  ps)       exec docker compose --env-file "$ENV_FILE" ps "$@" ;;
  backend)  load_env; exec java -jar backend/target/*.jar "$@" ;;
  ai)       load_env; ( cd ai-service && exec python -m app "$@" ) ;;
  frontend) load_env; ( cd frontend && exec npm start -- "$@" ) ;;
  test-e2e) load_env; ( cd tests/integration && exec python -m pytest -q "$@" ) ;;
  seed)     load_env; exec curl -s -X POST "$API_BASE_URL/api/import/eml-dir" \
              --data-urlencode "path=$(pwd)/sample-data/emails" ;;
  report)   load_env; exec curl -s "$API_BASE_URL/api/batch/report" ;;
  *) echo "usage: ./run.sh [-local] {up|down|logs|ps|backend|ai|frontend|test-e2e|seed|report} [args]" >&2
     exit 2 ;;
esac
