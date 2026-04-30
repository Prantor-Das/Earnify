import { Router } from "express";

import { CampaignStatus, prisma } from "@virlo/db";

import { requireAuth } from "../../middleware/auth.ts";
import { sendError, sendSuccess } from "../utils/api-response.ts";

const dashboardRouter = Router();

function toNumber(value: unknown) {
  if (typeof value === "number") {
    return value;
  }

  return Number(value ?? 0);
}

dashboardRouter.get("/", async (_request, response) => {
  const [paidOut, activeCampaigns, registeredCreators] = await Promise.all([
    prisma.payout.aggregate({
      where: {
        status: "COMPLETED",
      },
      _sum: {
        amount: true,
      },
    }),
    prisma.campaign.count({
      where: {
        status: CampaignStatus.ACTIVE,
      },
    }),
    prisma.user.count({
      where: {
        role: "USER",
      },
    }),
  ]);

  sendSuccess(response, {
    totalXlmPaidOut: toNumber(paidOut._sum.amount),
    activeCampaigns,
    registeredCreators,
  });
});

dashboardRouter.get("/creator", requireAuth, async (request, response) => {
  if (!request.user) {
    sendError(response, "Unauthorized", 401);
    return;
  }

  const [paidOut, pendingPayout, activePosts, rankedScores] = await Promise.all(
    [
      prisma.payout.aggregate({
        where: {
          userId: request.user.id,
          status: "COMPLETED",
        },
        _sum: {
          amount: true,
        },
      }),
      prisma.payout.aggregate({
        where: {
          userId: request.user.id,
          status: "PENDING",
        },
        _sum: {
          amount: true,
        },
      }),
      prisma.post.count({
        where: {
          userId: request.user.id,
          campaign: {
            status: CampaignStatus.ACTIVE,
          },
        },
      }),
      prisma.score.groupBy({
        by: ["userId"],
        _sum: {
          totalScore: true,
        },
        orderBy: {
          _sum: {
            totalScore: "desc",
          },
        },
      }),
    ],
  );

  const rankIndex = rankedScores.findIndex(
    (entry) => entry.userId === request.user?.id,
  );

  sendSuccess(response, {
    totalEarned: toNumber(paidOut._sum.amount),
    activePosts,
    pendingPayout: toNumber(pendingPayout._sum.amount),
    rank: rankIndex >= 0 ? rankIndex + 1 : null,
  });
});

dashboardRouter.get("/founder", requireAuth, async (request, response) => {
  if (!request.user) {
    sendError(response, "Unauthorized", 401);
    return;
  }

  const campaigns = await prisma.campaign.findMany({
    where: {
      founderId: request.user.id,
    },
    select: {
      id: true,
      totalBudget: true,
      status: true,
      posts: {
        select: {
          engagements: {
            orderBy: {
              fetchedAt: "desc",
            },
            take: 1,
            select: {
              views: true,
              likes: true,
              shares: true,
              comments: true,
            },
          },
        },
      },
    },
  });

  let totalReach = 0;
  let totalInteractions = 0;

  for (const campaign of campaigns) {
    for (const post of campaign.posts) {
      const engagement = post.engagements[0];
      if (!engagement) continue;

      totalReach += engagement.views;
      totalInteractions +=
        engagement.likes + engagement.shares + engagement.comments;
    }
  }

  const totalBudgetDeployed = campaigns.reduce(
    (sum, campaign) => sum + toNumber(campaign.totalBudget),
    0,
  );

  sendSuccess(response, {
    totalBudgetDeployed,
    totalReach,
    activeCampaigns: campaigns.filter(
      (campaign) => campaign.status === CampaignStatus.ACTIVE,
    ).length,
    engagementRate: totalReach > 0 ? (totalInteractions / totalReach) * 100 : 0,
  });
});

dashboardRouter.get("/earnings", requireAuth, async (request, response) => {
  if (!request.user) {
    sendError(response, "Unauthorized", 401);
    return;
  }

  const activeCampaigns = await prisma.campaign.findMany({
    where: {
      status: CampaignStatus.ACTIVE,
      posts: {
        some: {
          userId: request.user.id,
          status: "VERIFIED",
        },
      },
    },
    select: {
      id: true,
      title: true,
      totalBudget: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (activeCampaigns.length === 0) {
    sendSuccess(response, []);
    return;
  }

  const campaignIds = activeCampaigns.map((campaign) => campaign.id);

  const [userScores, totalScores, postCounts, scoreUpdates] = await Promise.all(
    [
      prisma.score.groupBy({
        by: ["campaignId"],
        where: {
          campaignId: {
            in: campaignIds,
          },
          userId: request.user.id,
        },
        _sum: {
          totalScore: true,
        },
      }),
      prisma.score.groupBy({
        by: ["campaignId"],
        where: {
          campaignId: {
            in: campaignIds,
          },
        },
        _sum: {
          totalScore: true,
        },
      }),
      prisma.post.groupBy({
        by: ["campaignId"],
        where: {
          campaignId: {
            in: campaignIds,
          },
          userId: request.user.id,
          status: "VERIFIED",
        },
        _count: {
          _all: true,
        },
      }),
      prisma.score.groupBy({
        by: ["campaignId"],
        where: {
          campaignId: {
            in: campaignIds,
          },
          userId: request.user.id,
        },
        _max: {
          updatedAt: true,
        },
      }),
    ],
  );

  const userScoreByCampaignId = new Map(
    userScores.map((entry) => [entry.campaignId, entry._sum.totalScore ?? 0]),
  );
  const totalScoreByCampaignId = new Map(
    totalScores.map((entry) => [entry.campaignId, entry._sum.totalScore ?? 0]),
  );
  const postCountByCampaignId = new Map(
    postCounts.map((entry) => [entry.campaignId, entry._count._all]),
  );
  const updatedAtByCampaignId = new Map(
    scoreUpdates.map((entry) => [
      entry.campaignId,
      entry._max.updatedAt?.toISOString() ?? new Date().toISOString(),
    ]),
  );

  const earnings = activeCampaigns.map((campaign) => {
    const userScore = userScoreByCampaignId.get(campaign.id) ?? 0;
    const totalCampaignScore = totalScoreByCampaignId.get(campaign.id) ?? 0;
    const campaignBudget = toNumber(campaign.totalBudget);
    const estimatedPayout =
      totalCampaignScore > 0
        ? (userScore / totalCampaignScore) * campaignBudget
        : 0;

    return {
      campaignId: campaign.id,
      campaignTitle: campaign.title,
      posts: postCountByCampaignId.get(campaign.id) ?? 0,
      currentScore: userScore,
      totalCampaignScore,
      campaignBudget,
      estimatedPayout,
      lastUpdatedAt:
        updatedAtByCampaignId.get(campaign.id) ?? new Date().toISOString(),
    };
  });

  sendSuccess(response, earnings);
});

export { dashboardRouter };
