import { Router } from "express";

import { prisma } from "@earnify/db";

import { requireAuth } from "../../middleware/auth";
import { claimPayout } from "../services/payoutService";
import { sendError, sendSuccess } from "../utils/api-response";

const usersRouter = Router();

function parseIdParam(value: string | string[] | undefined): string | null {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  return null;
}

function toNumber(value: unknown) {
  if (typeof value === "number") {
    return value;
  }

  return Number(value ?? 0);
}

function isValidStellarPublicKey(value: string) {
  return /^G[A-Z2-7]{55}$/.test(value);
}

usersRouter.get("/:id/payouts", requireAuth, async (request, response) => {
  const userId = parseIdParam(request.params.id);

  if (!userId) {
    sendError(response, "User id is required", 400);
    return;
  }

  if (!request.user) {
    sendError(response, "Unauthorized", 401);
    return;
  }

  if (request.user.id !== userId) {
    sendError(response, "Forbidden", 403);
    return;
  }

  const user = await prisma.user.findUnique({
    where: {
      id: userId
    },
    select: {
      id: true,
      walletAddress: true
    }
  });

  if (!user) {
    sendError(response, "User not found", 404);
    return;
  }

  const payouts = await prisma.payout.findMany({
    where: {
      userId
    },
    include: {
      campaign: {
        select: {
          id: true,
          title: true
        }
      }
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  sendSuccess(response, {
    userId: user.id,
    walletAddress: user.walletAddress,
    payouts: payouts.map((payout) => ({
      id: payout.id,
      campaignId: payout.campaignId,
      campaignTitle: payout.campaign.title,
      amount: toNumber(payout.amount),
      status: payout.status,
      stellarTxHash: payout.stellarTxHash,
      stellarTxUrl: payout.stellarTxHash
        ? `https://testnet.stellar.expert/explorer/testnet/tx/${payout.stellarTxHash}`
        : null,
      createdAt: payout.createdAt.toISOString()
    }))
  });
});

usersRouter.patch("/:id/wallet", requireAuth, async (request, response) => {
  const userId = parseIdParam(request.params.id);
  const walletAddress = (request.body as { walletAddress?: string }).walletAddress?.trim();

  if (!userId) {
    sendError(response, "User id is required", 400);
    return;
  }

  if (!request.user) {
    sendError(response, "Unauthorized", 401);
    return;
  }

  if (request.user.id !== userId) {
    sendError(response, "Forbidden", 403);
    return;
  }

  if (!walletAddress || !isValidStellarPublicKey(walletAddress)) {
    sendError(response, "walletAddress must be a valid Stellar public key", 400);
    return;
  }

  const updatedUser = await prisma.user.update({
    where: {
      id: userId
    },
    data: {
      walletAddress
    },
    select: {
      id: true,
      walletAddress: true
    }
  });

  sendSuccess(response, updatedUser);
});

usersRouter.post("/:id/payouts/:campaignId/claim", requireAuth, async (request, response) => {
  const userId = parseIdParam(request.params.id);
  const campaignId = parseIdParam(request.params.campaignId);

  if (!userId || !campaignId) {
    sendError(response, "User id and campaign id are required", 400);
    return;
  }

  if (!request.user) {
    sendError(response, "Unauthorized", 401);
    return;
  }

  if (request.user.id !== userId) {
    sendError(response, "Forbidden", 403);
    return;
  }

  try {
    const result = await claimPayout(userId, campaignId);
    sendSuccess(response, result);
  } catch (error) {
    sendError(response, error instanceof Error ? error.message : "Failed to claim payout", 400);
  }
});

export { usersRouter };