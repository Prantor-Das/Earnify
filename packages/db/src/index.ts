import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
import prismaClient from "@prisma/client";
import { Pool } from "pg";

type PrismaModule = typeof import("@prisma/client");
type PrismaClientConstructor = PrismaModule["PrismaClient"];
type PrismaClientInstance = InstanceType<PrismaClientConstructor>;

const {
  PrismaClient,
  CampaignStatus: CampaignStatusEnum,
  PostStatus: PostStatusEnum,
  PayoutStatus: PayoutStatusEnum,
  SocialPlatform: SocialPlatformEnum,
  UserRole: UserRoleEnum
} = prismaClient as PrismaModule;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
loadEnv({ path: path.resolve(__dirname, "../../../.env") });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required. Set it to your Neon Postgres connection string.");
}

const pool = new Pool({
  connectionString: databaseUrl
});
const adapter = new PrismaPg(pool);

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClientInstance | undefined;
}

export const prisma: PrismaClientInstance = globalThis.prismaGlobal ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalThis.prismaGlobal = prisma;
}

export const CampaignStatus = CampaignStatusEnum;
export type CampaignStatus = (typeof CampaignStatus)[keyof typeof CampaignStatus];

export const PostStatus = PostStatusEnum;
export type PostStatus = (typeof PostStatus)[keyof typeof PostStatus];

export const PayoutStatus = PayoutStatusEnum;
export type PayoutStatus = (typeof PayoutStatus)[keyof typeof PayoutStatus];

export const SocialPlatform = SocialPlatformEnum;
export type SocialPlatform = (typeof SocialPlatform)[keyof typeof SocialPlatform];

export const UserRole = UserRoleEnum;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];
