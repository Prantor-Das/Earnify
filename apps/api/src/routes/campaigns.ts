import { Router } from "express";

import { CampaignStatus, prisma } from "@earnify/db";

import { requireAuth, requireRole } from "../../middleware/auth";
import { getTopN } from "../services/leaderboard";
import { executeCampaignPayouts } from "../services/payoutService";
import { createCampaignWallet, encryptSecretKey } from "../services/stellar";
import { sendError, sendSuccess } from "../utils/api-response";

const campaignsRouter = Router();

function toNumber(value: unknown) {
  if (typeof value === "number") {
    return value;
  }

  return Number(value ?? 0);
}

function parseCampaignStatus(value: unknown): CampaignStatus | null {
  if (value === CampaignStatus.ACTIVE || value === CampaignStatus.PAUSED || value === CampaignStatus.ENDED) {
    return value;
  }

  return null;
}

function parseIdParam(value: string | string[] | undefined): string | null {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  return null;
}

campaignsRouter.post("/", requireAuth, requireRole("FOUNDER"), async (request, response) => {
  const { title, description, productUrl, totalBudget, endsAt } = request.body as {
    title?: string;
    description?: string;
    productUrl?: string;
    totalBudget?: number;
    endsAt?: string;
  };

  if (!title || !description || !productUrl || !totalBudget || !endsAt) {
    sendError(response, "Missing required fields", 400);
    return;
  }

  const budget = Number(totalBudget);
  const campaignEnd = new Date(endsAt);

  if (Number.isNaN(budget) || budget <= 0) {
    sendError(response, "totalBudget must be a positive number", 400);
    return;
  }

  if (Number.isNaN(campaignEnd.getTime())) {
    sendError(response, "endsAt must be a valid ISO date", 400);
    return;
  }

  try {
    if (!request.user) {
      sendError(response, "Unauthorized", 401);
      return;
    }

    const { publicKey, secretKey } = await createCampaignWallet();
    const encryptedSecretKey = encryptSecretKey(secretKey);

    const campaign = await prisma.campaign.create({
      data: {
        title: title.trim(),
        description: description.trim(),
        productUrl: productUrl.trim(),
        totalBudget: budget,
        remainingBudget: budget,
        endsAt: campaignEnd,
        founderId: request.user.id,
        stellarWalletPublicKey: publicKey,
        stellarWalletSecretKeyEncrypted: encryptedSecretKey
      }
    });

    sendSuccess(
      response,
      {
        id: campaign.id,
        title: campaign.title,
        description: campaign.description,
        productUrl: campaign.productUrl,
        totalBudget: toNumber(campaign.totalBudget),
        remainingBudget: toNumber(campaign.remainingBudget),
        status: campaign.status,
        founderId: campaign.founderId,
        endsAt: campaign.endsAt.toISOString(),
        createdAt: campaign.createdAt.toISOString(),
        walletAddress: campaign.stellarWalletPublicKey
      },
      201
    );
  } catch {
    sendError(response, "Failed to create campaign", 500);
  }
});

campaignsRouter.get("/", async (_request, response) => {
  const campaigns = await prisma.campaign.findMany({
    where: {
      status: CampaignStatus.ACTIVE
    },
    include: {
      _count: {
        select: {
          posts: true
        }
      }
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  sendSuccess(
    response,
    campaigns.map((campaign) => ({
      id: campaign.id,
      title: campaign.title,
      description: campaign.description,
      productUrl: campaign.productUrl,
      totalBudget: toNumber(campaign.totalBudget),
      remainingBudget: toNumber(campaign.remainingBudget),
      status: campaign.status,
      founderId: campaign.founderId,
      endsAt: campaign.endsAt.toISOString(),
      createdAt: campaign.createdAt.toISOString(),
      postCount: campaign._count.posts
    }))
  );
});

campaignsRouter.get("/:id", async (request, response) => {
  const campaignId = parseIdParam(request.params.id);

  if (!campaignId) {
    sendError(response, "Campaign id is required", 400);
    return;
  }

  const campaign = await prisma.campaign.findUnique({
    where: {
      id: campaignId
    },
    include: {
      _count: {
        select: {
          posts: true
        }
      }
    }
  });

  if (!campaign) {
    sendError(response, "Campaign not found", 404);
    return;
  }

  const topScore = await prisma.score.findFirst({
    where: {
      campaignId: campaign.id
    },
    orderBy: {
      totalScore: "desc"
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          avatar: true
        }
      }
    }
  });

  sendSuccess(response, {
    id: campaign.id,
    title: campaign.title,
    description: campaign.description,
    productUrl: campaign.productUrl,
    totalBudget: toNumber(campaign.totalBudget),
    remainingBudget: toNumber(campaign.remainingBudget),
    status: campaign.status,
    founderId: campaign.founderId,
    walletAddress: campaign.stellarWalletPublicKey,
    endsAt: campaign.endsAt.toISOString(),
    createdAt: campaign.createdAt.toISOString(),
    stats: {
      postCount: campaign._count.posts,
      remainingBudget: toNumber(campaign.remainingBudget),
      topScorer: topScore
        ? {
            userId: topScore.user.id,
            name: topScore.user.name,
            avatar: topScore.user.avatar,
            score: topScore.totalScore
          }
        : null
    }
  });
});

campaignsRouter.patch("/:id", requireAuth, requireRole("FOUNDER"), async (request, response) => {
  const campaignId = parseIdParam(request.params.id);
  const status = parseCampaignStatus((request.body as { status?: string }).status);

  if (!campaignId) {
    sendError(response, "Campaign id is required", 400);
    return;
  }

  if (!status) {
    sendError(response, "status must be ACTIVE, PAUSED, or ENDED", 400);
    return;
  }

  if (!request.user) {
    sendError(response, "Unauthorized", 401);
    return;
  }

  const existingCampaign = await prisma.campaign.findUnique({
    where: {
      id: campaignId
    },
    select: {
      founderId: true
    }
  });

  if (!existingCampaign) {
    sendError(response, "Campaign not found", 404);
    return;
  }

  if (existingCampaign.founderId !== request.user.id) {
    sendError(response, "Forbidden", 403);
    return;
  }

  const campaign = await prisma.campaign.update({
    where: {
      id: campaignId
    },
    data: {
      status
    }
  });

  sendSuccess(response, {
    id: campaign.id,
    status: campaign.status
  });
});

campaignsRouter.get("/:id/leaderboard", async (request, response) => {
  const campaignId = parseIdParam(request.params.id);

  if (!campaignId) {
    sendError(response, "Campaign id is required", 400);
    return;
  }

  const campaign = await prisma.campaign.findUnique({
    where: {
      id: campaignId
    },
    select: {
      id: true
    }
  });

  if (!campaign) {
    sendError(response, "Campaign not found", 404);
    return;
  }

  const leaderboard = await getTopN(campaign.id, 10);

  sendSuccess(response, leaderboard);
});

campaignsRouter.post("/:id/payout", requireAuth, requireRole("FOUNDER"), async (request, response) => {
  const campaignId = parseIdParam(request.params.id);

  if (!campaignId) {
    sendError(response, "Campaign id is required", 400);
    return;
  }

  if (!request.user) {
    sendError(response, "Unauthorized", 401);
    return;
  }

  const campaign = await prisma.campaign.findUnique({
    where: {
      id: campaignId
    },
    select: {
      id: true,
      founderId: true
    }
  });

  if (!campaign) {
    sendError(response, "Campaign not found", 404);
    return;
  }

  if (campaign.founderId !== request.user.id) {
    sendError(response, "Forbidden", 403);
    return;
  }

  try {
    const result = await executeCampaignPayouts(campaign.id, { allowManualTrigger: true });
    sendSuccess(response, result);
  } catch (error) {
    sendError(response, error instanceof Error ? error.message : "Failed to execute payout", 400);
  }
});

campaignsRouter.get("/:id/payouts", requireAuth, async (request, response) => {
  const campaignId = parseIdParam(request.params.id);

  if (!campaignId) {
    sendError(response, "Campaign id is required", 400);
    return;
  }

  if (!request.user) {
    sendError(response, "Unauthorized", 401);
    return;
  }

  const campaign = await prisma.campaign.findUnique({
    where: {
      id: campaignId
    },
    select: {
      id: true,
      founderId: true
    }
  });

  if (!campaign) {
    sendError(response, "Campaign not found", 404);
    return;
  }

  if (campaign.founderId !== request.user.id) {
    sendError(response, "Forbidden", 403);
    return;
  }

  const payouts = await prisma.payout.findMany({
    where: {
      campaignId: campaign.id
    },
    include: {
      user: {
        select: {
          id: true,
          name: true
        }
      }
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  sendSuccess(
    response,
    payouts.map((payout) => ({
      id: payout.id,
      campaignId: payout.campaignId,
      userId: payout.userId,
      userName: payout.user.name,
      amount: toNumber(payout.amount),
      status: payout.status,
      stellarTxHash: payout.stellarTxHash,
      stellarTxUrl: payout.stellarTxHash
        ? `https://testnet.stellar.expert/explorer/testnet/tx/${payout.stellarTxHash}`
        : null,
      createdAt: payout.createdAt.toISOString()
    }))
  );
});

export { campaignsRouter };
