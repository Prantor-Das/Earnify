#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACT_DIR="$ROOT_DIR/contracts/virlo-campaign"
WASM_PATH="$CONTRACT_DIR/target/wasm32v1-none/release/virlo_campaign.wasm"
OPT_WASM_PATH="$CONTRACT_DIR/target/wasm32v1-none/release/virlo_campaign.optimized.wasm"
ARTIFACT_PATH="$CONTRACT_DIR/artifacts/virlo_campaign.optimized.wasm"

export PATH="$HOME/.cargo/bin:$PATH"

if ! command -v rustup >/dev/null 2>&1; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
    | sh -s -- -y --profile minimal
  export PATH="$HOME/.cargo/bin:$PATH"
fi

rustup target add wasm32v1-none

if ! command -v stellar >/dev/null 2>&1; then
  cargo install --locked stellar-cli --features opt
fi

cd "$CONTRACT_DIR"
stellar contract build

if [[ ! -f "$WASM_PATH" ]]; then
  echo "Contract build finished, but $WASM_PATH was not created." >&2
  exit 1
fi

stellar contract optimize --wasm "$WASM_PATH"

if [[ ! -f "$OPT_WASM_PATH" ]]; then
  echo "Contract optimize finished, but $OPT_WASM_PATH was not created." >&2
  exit 1
fi

mkdir -p "$(dirname "$ARTIFACT_PATH")"
cp "$OPT_WASM_PATH" "$ARTIFACT_PATH"

echo "Built optimized contract WASM: $OPT_WASM_PATH"
echo "Updated deploy artifact: $ARTIFACT_PATH"
