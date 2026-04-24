#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACT_DIR="$ROOT_DIR/contracts/earnify-campaign"
ENV_FILE="$ROOT_DIR/.env"

if [[ -z "${STELLAR_ADMIN_SECRET:-}" && -f "$ENV_FILE" ]]; then
  STELLAR_ADMIN_SECRET="$(grep -E '^STELLAR_ADMIN_SECRET=' "$ENV_FILE" | tail -n 1 | cut -d= -f2- || true)"
  export STELLAR_ADMIN_SECRET
fi

if [[ -z "${STELLAR_ADMIN_SECRET:-}" ]]; then
  echo "Error: STELLAR_ADMIN_SECRET is required (env var or .env)."
  exit 1
fi

if [[ ! "$STELLAR_ADMIN_SECRET" =~ ^S[A-Z2-7]{55}$ ]]; then
  echo "Error: STELLAR_ADMIN_SECRET must be a valid Stellar secret seed (starts with 'S')."
  exit 1
fi

if ! command -v stellar >/dev/null 2>&1; then
  echo "Error: stellar CLI is not installed. Install with: cargo install --locked stellar-cli --features opt"
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "Error: jq is required for JSON parsing. Install with: brew install jq"
  exit 1
fi

echo "Building Soroban contract..."
cd "$CONTRACT_DIR"
stellar contract build

WASM_PATH="$CONTRACT_DIR/target/wasm32v1-none/release/earnify_campaign.wasm"
OPT_WASM_PATH="$CONTRACT_DIR/target/wasm32v1-none/release/earnify_campaign.optimized.wasm"

echo "Optimizing WASM..."
stellar contract optimize --wasm "$WASM_PATH"

echo "Checking admin account balance..."
ADMIN_PUBLIC_KEY=$(node --input-type=module -e "import * as sdk from '@stellar/stellar-sdk'; console.log(sdk.Keypair.fromSecret(process.env.STELLAR_ADMIN_SECRET).publicKey());")
BALANCE=$(curl -fsSL "https://horizon-testnet.stellar.org/accounts/$ADMIN_PUBLIC_KEY" | jq -r '.balances[] | select(.asset_type=="native") | .balance // "0"')
BALANCE_INT=${BALANCE%.*}

if [[ "${BALANCE_INT:-0}" -lt 100 ]]; then
  echo "Funding admin account with Friendbot..."
  curl -fsSL "https://friendbot.stellar.org/?addr=$ADMIN_PUBLIC_KEY" >/dev/null
fi

echo "Deploying contract to testnet..."
CONTRACT_ID=$(stellar contract deploy \
  --wasm "$OPT_WASM_PATH" \
  --source "$STELLAR_ADMIN_SECRET" \
  --network testnet | tail -n 1 | tr -d '\r')

if [[ ! "$CONTRACT_ID" =~ ^C[A-Z0-9]{55}$ ]]; then
  echo "Error: deployment did not return a valid contract id."
  exit 1
fi

echo "Deployed contract id: $CONTRACT_ID"

if [[ -f "$ENV_FILE" ]]; then
  if grep -q '^SOROBAN_CONTRACT_ID=' "$ENV_FILE"; then
    sed -i.bak "s/^SOROBAN_CONTRACT_ID=.*/SOROBAN_CONTRACT_ID=$CONTRACT_ID/" "$ENV_FILE"
  else
    printf "\nSOROBAN_CONTRACT_ID=%s\n" "$CONTRACT_ID" >>"$ENV_FILE"
  fi
  if grep -q '^SOROBAN_WASM_PATH=' "$ENV_FILE"; then
    sed -i.bak "s|^SOROBAN_WASM_PATH=.*|SOROBAN_WASM_PATH=contracts/earnify-campaign/target/wasm32v1-none/release/earnify_campaign.optimized.wasm|" "$ENV_FILE"
  else
    printf "SOROBAN_WASM_PATH=contracts/earnify-campaign/target/wasm32v1-none/release/earnify_campaign.optimized.wasm\n" >>"$ENV_FILE"
  fi
else
  printf "SOROBAN_CONTRACT_ID=%s\n" "$CONTRACT_ID" >"$ENV_FILE"
  printf "SOROBAN_WASM_PATH=contracts/earnify-campaign/target/wasm32v1-none/release/earnify_campaign.optimized.wasm\n" >>"$ENV_FILE"
fi

echo "Updated .env with SOROBAN_CONTRACT_ID=$CONTRACT_ID"
