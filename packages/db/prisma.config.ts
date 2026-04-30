import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "prisma/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
loadEnv({ path: path.resolve(__dirname, "../../.env") });

const databaseUrl = process.env.DATABASE_URL;
const localDatabaseUrl = process.env.LOCAL_DATABASE_URL;
const isGenerateCommand = process.argv.some((arg) => arg === "generate");
const isMigrateDevCommand =
  process.argv.includes("migrate") && process.argv.includes("dev");
const datasourceUrl =
  isMigrateDevCommand && localDatabaseUrl ? localDatabaseUrl : databaseUrl;

if (!datasourceUrl && !isGenerateCommand) {
  throw new Error(
    "DATABASE_URL is required. Set it to your Postgres connection string.",
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
      datasourceUrl ??
      "postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public",
  },
});
