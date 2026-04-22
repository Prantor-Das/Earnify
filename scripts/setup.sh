#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v rustc >/dev/null 2>&1; then
  echo "Error: Rust is required for Soroban contracts."
  echo "Install with: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
  exit 1
fi

if ! rustup target list --installed | grep -q 'wasm32-unknown-unknown'; then
  echo "Error: wasm32 target is missing."
  echo "Install with: rustup target add wasm32-unknown-unknown"
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
