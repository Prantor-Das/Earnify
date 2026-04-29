import { PrismaPg } from "@prisma/adapter-pg";
import prismaClient from "@prisma/client";
import { Pool } from "pg";

const { CampaignStatus, PostStatus, PrismaClient, SocialPlatform, UserRole } =
  prismaClient as typeof import("@prisma/client");

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is required. Set it to your Neon Postgres connection string.",
  );
}

const pool = new Pool({
  connectionString: databaseUrl,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

type SeededPostInput = {
  campaignId: string;
  userId: string;
  postUrl: string;
  platform: keyof typeof SocialPlatform;
  authenticityScore: number;
  engagement: {
    views: number;
    likes: number;
    shares: number;
    comments: number;
  };
};

function computePostScore(input: {
  views: number;
  likes: number;
  shares: number;
  comments: number;
  authenticityScore: number;
}) {
  return (
    input.views * 0.1 +
    input.likes * 1.0 +
    input.shares * 2.0 +
    input.comments * 1.5 +
    input.authenticityScore * 50
  );
}

function addDays(baseDate: Date, daysToAdd: number) {
  const clonedDate = new Date(baseDate);
  clonedDate.setDate(clonedDate.getDate() + daysToAdd);
  return clonedDate;
}

function makeSeedWallet(seed: string) {
  return `G${seed.repeat(55).slice(0, 55)}`;
}

async function main() {
  await prisma.payout.deleteMany();
  await prisma.score.deleteMany();
  await prisma.postEngagement.deleteMany();
  await prisma.post.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.user.deleteMany();

  const [founder, bob, priya, jaewon] = await Promise.all([
    prisma.user.create({
      data: {
        email: "alice@earnify.io",
        name: "Alice Chen",
        avatar: "https://lh3.googleusercontent.com/a/default-user=s96-c",
        role: UserRole.FOUNDER,
        walletAddress: makeSeedWallet("A"),
      },
    }),
    prisma.user.create({
      data: {
        email: "bob@earnify.io",
        name: "Bob Singh",
        avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e",
        role: UserRole.USER,
        walletAddress: makeSeedWallet("B"),
      },
    }),
    prisma.user.create({
      data: {
        email: "priya@earnify.io",
        name: "Priya Kumar",
        avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80",
        role: UserRole.USER,
        walletAddress: makeSeedWallet("C"),
      },
    }),
    prisma.user.create({
      data: {
        email: "jaewon@earnify.io",
        name: "Jae-won Oh",
        avatar: "https://images.unsplash.com/photo-1542204625-de293a5c4a31",
        role: UserRole.USER,
        walletAddress: makeSeedWallet("D"),
      },
    }),
  ]);

  const now = new Date();

  const [devflowCampaign, greenbiteCampaign] = await Promise.all([
    prisma.campaign.create({
      data: {
        title: "Launch of DevFlow — AI Code Review Tool",
        description:
          "Kick off DevFlow with creator-led product walkthroughs, before/after code examples, and adoption proof points.",
        productUrl: "https://devflow.app",
        totalBudget: 500,
        remainingBudget: 500,
        status: CampaignStatus.ACTIVE,
        founderId: founder.id,
        stellarWalletPublicKey: makeSeedWallet("L"),
        endsAt: addDays(now, 7),
      },
    }),
    prisma.campaign.create({
      data: {
        title: "GreenBite Snacks — Healthy Snacking Campaign",
        description:
          "Drive awareness for GreenBite with authentic short-form content around healthy snacking routines and product reviews.",
        productUrl: "https://greenbite.example.com",
        totalBudget: 200,
        remainingBudget: 200,
        status: CampaignStatus.ACTIVE,
        founderId: founder.id,
        stellarWalletPublicKey: makeSeedWallet("G"),
        endsAt: addDays(now, 14),
      },
    }),
  ]);

  const postInputs: SeededPostInput[] = [
    {
      campaignId: devflowCampaign.id,
      userId: bob.id,
      postUrl: "https://x.com/bobsingh/status/193812340001",
      platform: SocialPlatform.TWITTER,
      authenticityScore: 0.96,
      engagement: { views: 9400, likes: 460, shares: 145, comments: 72 },
    },
    {
      campaignId: devflowCampaign.id,
      userId: priya.id,
      postUrl:
        "https://www.linkedin.com/posts/priyakumar_devflow-code-review-productivity-activity-733301",
      platform: SocialPlatform.LINKEDIN,
      authenticityScore: 0.93,
      engagement: { views: 7200, likes: 390, shares: 108, comments: 64 },
    },
    {
      campaignId: devflowCampaign.id,
      userId: jaewon.id,
      postUrl: "https://www.instagram.com/p/DEVFLOWDEMO/",
      platform: SocialPlatform.INSTAGRAM,
      authenticityScore: 0.88,
      engagement: { views: 6100, likes: 310, shares: 82, comments: 41 },
    },
    {
      campaignId: greenbiteCampaign.id,
      userId: bob.id,
      postUrl:
        "https://www.linkedin.com/posts/bobsingh_greenbite-healthysnacking-wellness-activity-812293",
      platform: SocialPlatform.LINKEDIN,
      authenticityScore: 0.9,
      engagement: { views: 5300, likes: 245, shares: 75, comments: 36 },
    },
    {
      campaignId: greenbiteCampaign.id,
      userId: priya.id,
      postUrl: "https://x.com/priyakumar/status/193812340002",
      platform: SocialPlatform.TWITTER,
      authenticityScore: 0.95,
      engagement: { views: 8600, likes: 410, shares: 121, comments: 55 },
    },
    {
      campaignId: greenbiteCampaign.id,
      userId: jaewon.id,
      postUrl: "https://www.instagram.com/p/GREENBITEBOOST/",
      platform: SocialPlatform.INSTAGRAM,
      authenticityScore: 0.84,
      engagement: { views: 4800, likes: 198, shares: 59, comments: 28 },
    },
  ];

  const seededPosts = await Promise.all(
    postInputs.map((input) =>
      prisma.post.create({
        data: {
          campaignId: input.campaignId,
          userId: input.userId,
          postUrl: input.postUrl,
          platform: input.platform,
          status: PostStatus.VERIFIED,
          authenticityScore: input.authenticityScore,
        },
        select: {
          id: true,
        },
      }),
    ),
  );

  await prisma.postEngagement.createMany({
    data: seededPosts.map((post, index) => ({
      postId: post.id,
      views: postInputs[index]?.engagement.views ?? 0,
      likes: postInputs[index]?.engagement.likes ?? 0,
      shares: postInputs[index]?.engagement.shares ?? 0,
      comments: postInputs[index]?.engagement.comments ?? 0,
      fetchedAt: new Date(),
    })),
  });

  await Promise.all(
    seededPosts.map((post, index) =>
      prisma.score.upsert({
        where: {
          postId_userId_campaignId: {
            postId: post.id,
            userId: postInputs[index]!.userId,
            campaignId: postInputs[index]!.campaignId,
          },
        },
        update: {
          totalScore: computePostScore({
            views: postInputs[index]!.engagement.views,
            likes: postInputs[index]!.engagement.likes,
            shares: postInputs[index]!.engagement.shares,
            comments: postInputs[index]!.engagement.comments,
            authenticityScore: postInputs[index]!.authenticityScore,
          }),
        },
        create: {
          postId: post.id,
          userId: postInputs[index]!.userId,
          campaignId: postInputs[index]!.campaignId,
          totalScore: computePostScore({
            views: postInputs[index]!.engagement.views,
            likes: postInputs[index]!.engagement.likes,
            shares: postInputs[index]!.engagement.shares,
            comments: postInputs[index]!.engagement.comments,
            authenticityScore: postInputs[index]!.authenticityScore,
          }),
        },
      }),
    ),
  );

  console.log(
    "Seeded 4 users, 2 active campaigns, 6 verified posts, engagements, and scores",
  );
  console.log({
    founder: founder.email,
    creators: [bob.email, priya.email, jaewon.email],
    campaignIds: [devflowCampaign.id, greenbiteCampaign.id],
    postIds: seededPosts.map((post) => post.id),
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
