import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL ?? "postgresql://earnify:earnify@localhost:5433/earnify?schema=public";
const pool = new Pool({
  connectionString: databaseUrl
});
const adapter = new PrismaPg(pool);

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
}

export const prisma = globalThis.prismaGlobal ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalThis.prismaGlobal = prisma;
}

export * from "@prisma/client";
