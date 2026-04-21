#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -f ".env" ]]; then
  echo ".env already exists, keeping current values"
else
  cp .env.example .env
  echo "Created .env from .env.example"
fi

if command -v docker-compose >/dev/null 2>&1; then
  docker-compose up -d
else
  docker compose up -d
fi

pnpm --filter @earnify/db exec prisma migrate deploy --config prisma.config.ts
pnpm --filter @earnify/db db:seed

cleanup() {
  kill "$API_PID" "$WEB_PID" >/dev/null 2>&1 || true
}

trap cleanup EXIT INT TERM

pnpm dev:api &
API_PID=$!

pnpm dev:web &
WEB_PID=$!

wait "$API_PID" "$WEB_PID"
