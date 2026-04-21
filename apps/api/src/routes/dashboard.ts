import { Router } from "express";

import { CampaignStatus, prisma } from "@earnify/db";

import { requireAuth } from "../../middleware/auth";
import { sendError, sendSuccess } from "../utils/api-response";

const dashboardRouter = Router();

function toNumber(value: unknown) {
  if (typeof value === "number") {
    return value;
  }

  return Number(value ?? 0);
}

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
          status: "VERIFIED"
        }
      }
    },
    select: {
      id: true,
      title: true,
      totalBudget: true
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  if (activeCampaigns.length === 0) {
    sendSuccess(response, []);
    return;
  }

  const campaignIds = activeCampaigns.map((campaign) => campaign.id);

  const [userScores, totalScores, postCounts, scoreUpdates] = await Promise.all([
    prisma.score.groupBy({
      by: ["campaignId"],
      where: {
        campaignId: {
          in: campaignIds
        },
        userId: request.user.id
      },
      _sum: {
        totalScore: true
      }
    }),
    prisma.score.groupBy({
      by: ["campaignId"],
      where: {
        campaignId: {
          in: campaignIds
        }
      },
      _sum: {
        totalScore: true
      }
    }),
    prisma.post.groupBy({
      by: ["campaignId"],
      where: {
        campaignId: {
          in: campaignIds
        },
        userId: request.user.id,
        status: "VERIFIED"
      },
      _count: {
        _all: true
      }
    }),
    prisma.score.groupBy({
      by: ["campaignId"],
      where: {
        campaignId: {
          in: campaignIds
        },
        userId: request.user.id
      },
      _max: {
        updatedAt: true
      }
    })
  ]);

  const userScoreByCampaignId = new Map(userScores.map((entry) => [entry.campaignId, entry._sum.totalScore ?? 0]));
  const totalScoreByCampaignId = new Map(totalScores.map((entry) => [entry.campaignId, entry._sum.totalScore ?? 0]));
  const postCountByCampaignId = new Map(postCounts.map((entry) => [entry.campaignId, entry._count._all]));
  const updatedAtByCampaignId = new Map(
    scoreUpdates.map((entry) => [entry.campaignId, entry._max.updatedAt?.toISOString() ?? new Date().toISOString()])
  );

  const earnings = activeCampaigns.map((campaign) => {
    const userScore = userScoreByCampaignId.get(campaign.id) ?? 0;
    const totalCampaignScore = totalScoreByCampaignId.get(campaign.id) ?? 0;
    const campaignBudget = toNumber(campaign.totalBudget);
    const estimatedPayout = totalCampaignScore > 0 ? (userScore / totalCampaignScore) * campaignBudget : 0;

    return {
      campaignId: campaign.id,
      campaignTitle: campaign.title,
      posts: postCountByCampaignId.get(campaign.id) ?? 0,
      currentScore: userScore,
      totalCampaignScore,
      campaignBudget,
      estimatedPayout,
      lastUpdatedAt: updatedAtByCampaignId.get(campaign.id) ?? new Date().toISOString()
    };
  });

  sendSuccess(response, earnings);
});

export { dashboardRouter };