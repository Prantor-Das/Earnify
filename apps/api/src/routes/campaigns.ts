import { Router } from "express";

import { CampaignStatus, prisma } from "@earnify/db";
import * as StellarSdk from "@stellar/stellar-sdk";

import { requireAuth, requireRole } from "../../middleware/auth";
import { getTopN } from "../services/leaderboard";
import {
  deployCampaignContract,
  endCampaign,
  getCampaignInfo,
  getContractBalance,
  triggerCreatorPayout
} from "../services/sorobanClient";
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

function getTxUrl(hash: string | null) {
  return hash ? `https://testnet.stellar.expert/explorer/testnet/tx/${hash}` : null;
}

function writeSse(response: { write: (chunk: string) => void }, event: string, data: unknown) {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}

campaignsRouter.post("/", requireAuth, requireRole("FOUNDER"), async (request, response) => {
  const { title, description, productUrl, totalBudget, endsAt, founderSecret } = request.body as {
    title?: string;
    description?: string;
    productUrl?: string;
    totalBudget?: number;
    endsAt?: string;
    founderSecret?: string;
  };

  if (!title || !description || !productUrl || !totalBudget || !endsAt || !founderSecret) {
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

  if (!request.user) {
    sendError(response, "Unauthorized", 401);
    return;
  }

  let founderPublicKey: string;
  try {
    founderPublicKey = StellarSdk.Keypair.fromSecret(founderSecret).publicKey();
  } catch {
    sendError(response, "founderSecret must be a valid Stellar secret key", 400);
    return;
  }

  try {
    const campaign = await prisma.campaign.create({
      data: {
        title: title.trim(),
        description: description.trim(),
        productUrl: productUrl.trim(),
        totalBudget: budget,
        remainingBudget: budget,
        endsAt: campaignEnd,
        founderId: request.user.id,
        stellarWalletPublicKey: founderPublicKey,
        stellarWalletSecretKeyEncrypted: null
      }
    });

    const deployment = await deployCampaignContract(founderSecret, budget);

    const updatedCampaign = await prisma.campaign.update({
      where: {
        id: campaign.id
      },
      data: {
        stellarContractId: deployment.contractId,
        fundingTxHash: deployment.txHash
      }
    });

    sendSuccess(
      response,
      {
        id: updatedCampaign.id,
        title: updatedCampaign.title,
        description: updatedCampaign.description,
        productUrl: updatedCampaign.productUrl,
        totalBudget: toNumber(updatedCampaign.totalBudget),
        remainingBudget: toNumber(updatedCampaign.remainingBudget),
        status: updatedCampaign.status,
        founderId: updatedCampaign.founderId,
        endsAt: updatedCampaign.endsAt.toISOString(),
        createdAt: updatedCampaign.createdAt.toISOString(),
        walletAddress: updatedCampaign.stellarWalletPublicKey,
        contractId: updatedCampaign.stellarContractId,
        fundingTxHash: updatedCampaign.fundingTxHash,
        contractExplorerUrl: updatedCampaign.stellarContractId
          ? `https://testnet.stellar.expert/explorer/testnet/contract/${updatedCampaign.stellarContractId}`
          : null,
        fundingTxUrl: getTxUrl(updatedCampaign.fundingTxHash)
      },
      201
    );
  } catch (error) {
    console.error("Failed to create campaign and deploy Soroban contract", error);
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
      postCount: campaign._count.posts,
      contractId: campaign.stellarContractId
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
    contractId: campaign.stellarContractId,
    fundingTxHash: campaign.fundingTxHash,
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

campaignsRouter.get("/:id/payout", requireAuth, requireRole("FOUNDER"), async (request, response) => {
  const campaignId = parseIdParam(request.params.id);
  const founderSecretRaw = request.query.founderSecret;
  const creatorSecretsRaw = request.query.creatorSecrets;
  const founderSecret = typeof founderSecretRaw === "string" ? founderSecretRaw : undefined;
  let creatorSecrets: Record<string, string> | undefined;

  if (typeof creatorSecretsRaw === "string" && creatorSecretsRaw.trim().length > 0) {
    try {
      creatorSecrets = JSON.parse(creatorSecretsRaw) as Record<string, string>;
    } catch {
      sendError(response, "creatorSecrets must be a valid JSON object string", 400);
      return;
    }
  }

  if (!campaignId) {
    sendError(response, "Campaign id is required", 400);
    return;
  }

  if (!request.user) {
    sendError(response, "Unauthorized", 401);
    return;
  }

  if (!founderSecret) {
    sendError(response, "founderSecret is required", 400);
    return;
  }

  const campaign = await prisma.campaign.findUnique({
    where: {
      id: campaignId
    },
    select: {
      id: true,
      founderId: true,
      stellarContractId: true
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

  if (!campaign.stellarContractId) {
    sendError(response, "Campaign is missing a Soroban contract id", 400);
    return;
  }

  response.setHeader("Content-Type", "text/event-stream");
  response.setHeader("Cache-Control", "no-cache, no-transform");
  response.setHeader("Connection", "keep-alive");
  response.setHeader("X-Accel-Buffering", "no");
  response.flushHeaders();

  try {
    const endTx = await endCampaign(campaign.stellarContractId, founderSecret);
    await prisma.campaign.update({
      where: {
        id: campaign.id
      },
      data: {
        status: CampaignStatus.ENDED
      }
    });

    writeSse(response, "campaign-ended", {
      txHash: endTx.txHash,
      txUrl: getTxUrl(endTx.txHash)
    });

    const groupedScores = await prisma.score.groupBy({
      by: ["userId"],
      where: {
        campaignId: campaign.id
      },
      _sum: {
        totalScore: true
      }
    });

    const userIds = groupedScores.map((entry) => entry.userId);
    const users = await prisma.user.findMany({
      where: {
        id: {
          in: userIds
        }
      },
      select: {
        id: true,
        name: true,
        walletAddress: true
      }
    });

    const usersById = new Map(users.map((user) => [user.id, user]));

    for (const score of groupedScores) {
      const user = usersById.get(score.userId);
      const scoreValue = score._sum.totalScore ?? 0;

      if (!user || scoreValue <= 0) {
        continue;
      }

      if (!user.walletAddress) {
        const payout = await prisma.payout.create({
          data: {
            userId: user.id,
            campaignId: campaign.id,
            amount: 0,
            status: "FAILED"
          }
        });

        writeSse(response, "payout", {
          payoutId: payout.id,
          creatorId: user.id,
          creatorName: user.name,
          amountXLM: 0,
          status: "FAILED",
          reason: "Creator wallet is not connected",
          txHash: null,
          txUrl: null
        });
        continue;
      }

      const creatorSecret = creatorSecrets?.[user.id];
      if (!creatorSecret) {
        const payout = await prisma.payout.create({
          data: {
            userId: user.id,
            campaignId: campaign.id,
            amount: 0,
            status: "FAILED"
          }
        });

        writeSse(response, "payout", {
          payoutId: payout.id,
          creatorId: user.id,
          creatorName: user.name,
          amountXLM: 0,
          status: "FAILED",
          reason: "creatorSecrets entry is missing for this creator",
          txHash: null,
          txUrl: null
        });
        continue;
      }

      try {
        const payoutResult = await triggerCreatorPayout(campaign.stellarContractId, creatorSecret);
        const payout = await prisma.payout.create({
          data: {
            userId: user.id,
            campaignId: campaign.id,
            amount: payoutResult.amountXLM,
            status: "COMPLETED",
            stellarTxHash: payoutResult.txHash
          }
        });

        writeSse(response, "payout", {
          payoutId: payout.id,
          creatorId: user.id,
          creatorName: user.name,
          amountXLM: payoutResult.amountXLM,
          status: "COMPLETED",
          txHash: payoutResult.txHash,
          txUrl: getTxUrl(payoutResult.txHash)
        });
      } catch (error) {
        const payout = await prisma.payout.create({
          data: {
            userId: user.id,
            campaignId: campaign.id,
            amount: 0,
            status: "FAILED"
          }
        });

        writeSse(response, "payout", {
          payoutId: payout.id,
          creatorId: user.id,
          creatorName: user.name,
          amountXLM: 0,
          status: "FAILED",
          reason: error instanceof Error ? error.message : "Payout failed",
          txHash: null,
          txUrl: null
        });
      }
    }

    const balance = await getContractBalance(campaign.stellarContractId);
    await prisma.campaign.update({
      where: {
        id: campaign.id
      },
      data: {
        remainingBudget: balance
      }
    });

    writeSse(response, "done", {
      campaignId: campaign.id,
      contractId: campaign.stellarContractId,
      balanceXLM: balance
    });
  } catch (error) {
    writeSse(response, "error", {
      message: error instanceof Error ? error.message : "Failed to execute payout"
    });
  } finally {
    response.end();
  }
});

campaignsRouter.get("/:id/contract-info", requireAuth, async (request, response) => {
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
      stellarContractId: true
    }
  });

  if (!campaign) {
    sendError(response, "Campaign not found", 404);
    return;
  }

  if (!campaign.stellarContractId) {
    sendError(response, "Campaign is missing a Soroban contract id", 400);
    return;
  }

  try {
    const [balance, contractInfo] = await Promise.all([
      getContractBalance(campaign.stellarContractId),
      getCampaignInfo(campaign.stellarContractId)
    ]);

    sendSuccess(response, {
      contractId: campaign.stellarContractId,
      balance,
      status: contractInfo.status,
      creatorScores: contractInfo.creatorScores,
      explorerUrl: `https://testnet.stellar.expert/explorer/testnet/contract/${campaign.stellarContractId}`
    });
  } catch (error) {
    sendError(response, error instanceof Error ? error.message : "Failed to fetch on-chain contract info", 500);
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
