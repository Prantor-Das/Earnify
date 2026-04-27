import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import * as StellarSdk from "@stellar/stellar-sdk";

const HORIZON_URL = "https://horizon-testnet.stellar.org";

const horizon = new StellarSdk.Horizon.Server(HORIZON_URL);

type CampaignWallet = {
  publicKey: string;
  secretKey: string;
};

async function createCampaignWallet(): Promise<CampaignWallet> {
  const keypair = StellarSdk.Keypair.random();
  return {
    publicKey: keypair.publicKey(),
    secretKey: keypair.secret()
  };
}

async function getWalletBalance(publicKey: string): Promise<number> {
  try {
    const account = await horizon.loadAccount(publicKey);
    const nativeBalance = account.balances.find((balance) => balance.asset_type === "native");

    return Number(nativeBalance?.balance ?? 0);
  } catch (error) {
    // If the wallet hasn't been created/funded yet, treat as zero balance.
    if (error instanceof Error && error.message.toLowerCase().includes("not found")) {
      return 0;
    }

    throw error;
  }
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

function decryptSecretKey(payload: string): string {
  const encryptionKey = process.env.STELLAR_ENCRYPTION_KEY;

  if (!encryptionKey) {
    throw new Error("STELLAR_ENCRYPTION_KEY is not configured");
  }

  const [ivEncoded, encryptedEncoded, authTagEncoded] = payload.split(":");

  if (!ivEncoded || !encryptedEncoded || !authTagEncoded) {
    throw new Error("Invalid encrypted secret key format");
  }

  const key = createHash("sha256").update(encryptionKey).digest();
  const iv = Buffer.from(ivEncoded, "base64");
  const encrypted = Buffer.from(encryptedEncoded, "base64");
  const authTag = Buffer.from(authTagEncoded, "base64");

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

  return decrypted.toString("utf8");
}

export { createCampaignWallet, decryptSecretKey, encryptSecretKey, getWalletBalance };
