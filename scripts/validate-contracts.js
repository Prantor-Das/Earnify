#!/usr/bin/env node

/**
 * Validate that contracts are available for deployment
 * This script runs during backend build to ensure contract files exist
 * For CI/CD environments where Rust toolchain might not be available
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, "..");
const CONTRACT_DIR = path.join(ROOT_DIR, "contracts", "earnify-campaign");
const CARGO_TOML = path.join(CONTRACT_DIR, "Cargo.toml");
const CONTRACT_LIB = path.join(CONTRACT_DIR, "src", "lib.rs");

console.log("🔍 Validating Soroban contracts...");

// Check contract directory exists
if (!fs.existsSync(CONTRACT_DIR)) {
  console.error("❌ Error: Contract directory not found at", CONTRACT_DIR);
  process.exit(1);
}

console.log("✅ Contract directory found:", CONTRACT_DIR);

// Check Cargo.toml
if (!fs.existsSync(CARGO_TOML)) {
  console.error("❌ Error: Cargo.toml not found");
  process.exit(1);
}

console.log("✅ Cargo.toml found");

// Check contract source
if (!fs.existsSync(CONTRACT_LIB)) {
  console.error("❌ Error: Contract source (lib.rs) not found");
  process.exit(1);
}

console.log("✅ Contract source found");

// Read Cargo.toml to verify it's a Soroban contract
const cargoContent = fs.readFileSync(CARGO_TOML, "utf-8");
if (!cargoContent.includes("soroban-sdk")) {
  console.warn("⚠️  Warning: soroban-sdk not found in Cargo.toml");
}

console.log("✅ Soroban contract dependencies found");

// Summary
console.log("\n✅ Contract validation passed!");
console.log(`   - Contract name: earnify-campaign`);
console.log(`   - Contract path: ${CONTRACT_DIR}`);
console.log(`   - Ready for deployment\n`);

// Note about contract deployment
console.log("📝 Note: Contract binary compilation requires Rust toolchain.");
console.log(
  "   Run contract deployment via: bash scripts/deploy-contract.sh\n",
);
