#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# db-deploy.sh
# Runs in both local (Docker Postgres) and production (Neon) environments.
#
# Usage:
#   ./scripts/db-deploy.sh              # uses DATABASE_URL from .env
#   DATABASE_URL=<neon-url> ./scripts/db-deploy.sh   # override inline
# ---------------------------------------------------------------------------

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Load .env if present and DATABASE_URL not already set
if [[ -z "${DATABASE_URL:-}" && -f "$ROOT_DIR/.env" ]]; then
  set -o allexport
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env"
  set +o allexport
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Error: DATABASE_URL is not set. Add it to .env or export it before running this script."
  exit 1
fi

echo "→ Deploying migrations..."
pnpm --filter @earnify/db exec prisma migrate deploy --config prisma.config.ts

echo "→ Generating Prisma Client..."
pnpm --filter @earnify/db db:generate

echo "✓ Database ready."
