#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# db-deploy.sh
# Runs migrations against Neon Postgres using DATABASE_URL.
#
# Usage:
#   ./scripts/db-deploy.sh              # uses DATABASE_URL from .env
#   DATABASE_URL=<neon-url> ./scripts/db-deploy.sh   # override inline
# ---------------------------------------------------------------------------

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Load .env if present and DATABASE_URL not already set
if [[ -z "${DATABASE_URL:-}" && -f "$ROOT_DIR/.env" ]]; then
  database_url_line="$(grep -E '^DATABASE_URL=' "$ROOT_DIR/.env" | tail -n 1 || true)"
  if [[ -n "$database_url_line" ]]; then
    DATABASE_URL="${database_url_line#DATABASE_URL=}"
    export DATABASE_URL
  fi
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Error: DATABASE_URL is not set. Add it to .env or export it before running this script."
  exit 1
fi

echo "→ Deploying migrations..."
PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=1 pnpm --filter @earnify/db exec prisma migrate deploy --config prisma.config.ts

echo "→ Generating Prisma Client..."
pnpm --filter @earnify/db db:generate

echo "✓ Database ready."
