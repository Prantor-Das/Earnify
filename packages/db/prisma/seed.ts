import { PrismaClient, UserRole, CampaignStatus } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.payout.deleteMany();
  await prisma.score.deleteMany();
  await prisma.postEngagement.deleteMany();
  await prisma.post.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.user.deleteMany();

  const [founder, creatorOne, creatorTwo] = await Promise.all([
    prisma.user.create({
      data: {
        email: "maya@earnify.io",
        name: "Maya Rao",
        avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330",
        role: UserRole.FOUNDER,
        walletAddress: "GBFOUNDERMAYA1234567890"
      }
    }),
    prisma.user.create({
      data: {
        email: "alex@earnify.io",
        name: "Alex Carter",
        avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e",
        role: UserRole.USER,
        walletAddress: "GBCREATORALEX1234567890"
      }
    }),
    prisma.user.create({
      data: {
        email: "sana@earnify.io",
        name: "Sana Iqbal",
        avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80",
        role: UserRole.USER,
        walletAddress: "GBCREATORSANA1234567890"
      }
    })
  ]);

  await prisma.campaign.createMany({
    data: [
      {
        title: "Launch Week Creator Push",
        description: "Drive awareness for Earnify among startup founders and creator operators.",
        productUrl: "https://earnify.app/launch-week",
        totalBudget: 12000,
        remainingBudget: 8600,
        status: CampaignStatus.ACTIVE,
        founderId: founder.id,
        stellarWalletPublicKey: "GBLAUNCHCAMPAIGN1234567890",
        endsAt: new Date("2026-06-30T18:30:00.000Z")
      },
      {
        title: "Referral Engine Spotlight",
        description: "Promote case studies showing how teams grow referrals through creator-led loops.",
        productUrl: "https://earnify.app/referrals",
        totalBudget: 8500,
        remainingBudget: 8500,
        status: CampaignStatus.PAUSED,
        founderId: founder.id,
        stellarWalletPublicKey: "GBREFERRALCAMPAIGN1234567890",
        endsAt: new Date("2026-08-15T18:30:00.000Z")
      }
    ]
  });

  console.log("Seeded 3 users and 2 campaigns");
  console.log({
    founder: founder.email,
    creators: [creatorOne.email, creatorTwo.email]
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
