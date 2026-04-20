import { createCipheriv, createHash, randomBytes } from "node:crypto";

import * as StellarSdk from "@stellar/stellar-sdk";

const HORIZON_URL = "https://horizon-testnet.stellar.org";
const FRIENDBOT_URL = "https://friendbot.stellar.org";

const horizon = new StellarSdk.Horizon.Server(HORIZON_URL);

type CampaignWallet = {
  publicKey: string;
  secretKey: string;
};

async function createCampaignWallet(): Promise<CampaignWallet> {
  const keypair = StellarSdk.Keypair.random();
  const publicKey = keypair.publicKey();

  const friendbotResponse = await fetch(`${FRIENDBOT_URL}?addr=${encodeURIComponent(publicKey)}`);

  if (!friendbotResponse.ok) {
    throw new Error("Friendbot funding failed");
  }

  return {
    publicKey,
    secretKey: keypair.secret()
  };
}

async function getWalletBalance(publicKey: string): Promise<number> {
  const account = await horizon.loadAccount(publicKey);
  const nativeBalance = account.balances.find((balance) => balance.asset_type === "native");

  return Number(nativeBalance?.balance ?? 0);
}

function encryptSecretKey(secretKey: string): string {
  const encryptionKey = process.env.STELLAR_ENCRYPTION_KEY;

  if (!encryptionKey) {
    throw new Error("STELLAR_ENCRYPTION_KEY is not configured");
  }

  const key = createHash("sha256").update(encryptionKey).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(secretKey, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString("base64")}:${encrypted.toString("base64")}:${authTag.toString("base64")}`;
}

export { createCampaignWallet, encryptSecretKey, getWalletBalance };
