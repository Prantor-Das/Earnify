#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PG_BIN_DIR="${PG_BIN_DIR:-/opt/homebrew/opt/postgresql@18/bin}"
PG_CTL="${PG_BIN_DIR}/pg_ctl"
INITDB="${PG_BIN_DIR}/initdb"
CREATEDB="${PG_BIN_DIR}/createdb"
PSQL="${PG_BIN_DIR}/psql"
PGDATA_DIR="${VIRLO_PGDATA:-${ROOT_DIR}/.local/postgres}"
POSTGRES_PORT="${POSTGRES_PORT:-5433}"
POSTGRES_DB="${POSTGRES_DB:-virlo}"
POSTGRES_USER="${POSTGRES_USER:-virlo}"
POSTGRES_LOG="${PGDATA_DIR}/postgres.log"

if [[ ! -x "$PG_CTL" || ! -x "$INITDB" || ! -x "$CREATEDB" || ! -x "$PSQL" ]]; then
  echo "Local PostgreSQL binaries were not found in ${PG_BIN_DIR}."
  echo "Install PostgreSQL or set PG_BIN_DIR to the directory containing pg_ctl, initdb, createdb, and psql."
  exit 1
fi

mkdir -p "$(dirname "$PGDATA_DIR")"

if [[ ! -f "${PGDATA_DIR}/PG_VERSION" ]]; then
  "$INITDB" -D "$PGDATA_DIR" --username="$POSTGRES_USER" --auth=trust --no-locale >/dev/null
  {
    echo "port = ${POSTGRES_PORT}"
    echo "listen_addresses = 'localhost'"
  } >>"${PGDATA_DIR}/postgresql.conf"
fi

if ! "$PG_CTL" -D "$PGDATA_DIR" status >/dev/null 2>&1; then
  "$PG_CTL" -D "$PGDATA_DIR" -l "$POSTGRES_LOG" start >/dev/null
fi

if ! "$PSQL" -h localhost -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '${POSTGRES_DB}'" | grep -q 1; then
  "$CREATEDB" -h localhost -p "$POSTGRES_PORT" -U "$POSTGRES_USER" "$POSTGRES_DB"
fi

echo "Local Virlo Postgres is ready on localhost:${POSTGRES_PORT}/${POSTGRES_DB}."
