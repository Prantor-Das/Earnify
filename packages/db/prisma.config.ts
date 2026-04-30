import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "prisma/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
loadEnv({ path: path.resolve(__dirname, "../../.env") });

const isMigrationCommand = process.argv.some((arg) =>
  ["migrate", "db", "deploy"].includes(arg),
);
const databaseUrl =
  isMigrationCommand
    ? (process.env.MIGRATION_DATABASE_URL ??
        process.env.DIRECT_URL ??
        process.env.DATABASE_URL)
    : process.env.DATABASE_URL;
const isGenerateCommand = process.argv.some((arg) => arg === "generate");

if (!databaseUrl && !isGenerateCommand) {
  throw new Error(
    "DATABASE_URL is required. Set it to your Supabase Postgres connection string.",
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "node --experimental-strip-types prisma/seed.ts",
  },
  datasource: {
    // `prisma generate` doesn't require a live DB connection; keep other commands strict.
    url:
      databaseUrl ??
      "postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public",
  },
});
