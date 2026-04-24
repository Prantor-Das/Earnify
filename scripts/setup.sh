#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v rustc >/dev/null 2>&1; then
  echo "Error: Rust is required for Soroban contracts."
  echo "Install with: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
  exit 1
fi

if ! rustup target list --installed | grep -q 'wasm32v1-none'; then
  echo "Error: wasm32v1-none target is missing."
  echo "Install with: rustup target add wasm32v1-none"
  exit 1
fi

if ! command -v stellar >/dev/null 2>&1; then
  echo "Error: Stellar CLI is required for Soroban contract workflows."
  echo "Install with: cargo install --locked stellar-cli --features opt"
  exit 1
fi

if [[ -f ".env" ]]; then
  echo ".env already exists, keeping current values"
else
  cp .env.example .env
  echo "Created .env from .env.example"
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  if [[ -f ".env" ]]; then
    database_url_line="$(grep -E '^DATABASE_URL=' .env | tail -n 1 || true)"
    if [[ -n "$database_url_line" ]]; then
      DATABASE_URL="${database_url_line#DATABASE_URL=}"
      export DATABASE_URL
    fi
  fi
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Error: DATABASE_URL is required. Set it in .env to your Neon connection string."
  exit 1
fi

PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=1 pnpm --filter @earnify/db exec prisma migrate deploy --config prisma.config.ts
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
