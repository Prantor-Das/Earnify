import { Router } from "express";

import { prisma } from "@earnify/db";
import * as StellarSdk from "@stellar/stellar-sdk";

import { requireAuth } from "../../middleware/auth.ts";
import { claimPayout } from "../services/payoutService.ts";
import { sendError, sendSuccess } from "../utils/api-response.ts";

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
  return StellarSdk.StrKey.isValidEd25519PublicKey(value);
}

function getExplorerUrl(term: string | null) {
  return term ? `https://stellar.expert/explorer/testnet/search?term=${encodeURIComponent(term)}` : null;
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
        ? getExplorerUrl(payout.stellarTxHash)
        : null,
      createdAt: payout.createdAt.toISOString()
    }))
  });
});

// PATCH /api/users/me/wallet — convenience endpoint for the authenticated user
// (used by WalletProvider after Freighter connection)
usersRouter.patch("/me/wallet", requireAuth, async (request, response) => {
  if (!request.user) {
    sendError(response, "Unauthorized", 401);
    return;
  }

  const walletAddress = (request.body as { walletAddress?: string }).walletAddress?.trim();

  if (!walletAddress || !isValidStellarPublicKey(walletAddress)) {
    sendError(response, "walletAddress must be a valid Stellar public key", 400);
    return;
  }

  const updatedUser = await prisma.user.update({
    where: { id: request.user.id },
    data: { walletAddress },
    select: { id: true, walletAddress: true }
  });

  sendSuccess(response, updatedUser);
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
  const body = (request.body ?? {}) as { walletAddress?: string };
  const walletAddress = typeof body.walletAddress === "string" ? body.walletAddress.trim() : undefined;

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

  const user = await prisma.user.findUnique({
    where: {
      id: userId
    },
    select: {
      walletAddress: true
    }
  });

  let resolvedWalletAddress = user?.walletAddress ?? null;

  if (!resolvedWalletAddress && walletAddress) {
    if (!isValidStellarPublicKey(walletAddress)) {
      sendError(response, "walletAddress must be a valid Stellar public key", 400);
      return;
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { walletAddress },
      select: { walletAddress: true }
    });
    resolvedWalletAddress = updatedUser.walletAddress;
  }

  if (!resolvedWalletAddress) {
    sendError(response, "Wallet address is required to claim payout. Connect Freighter and try again.", 400);
    return;
  }

  try {
    const payout = await claimPayout(userId, campaignId);
    sendSuccess(response, {
      id: payout.id,
      status: payout.status,
      amount: toNumber(payout.amount),
      stellarTxHash: payout.stellarTxHash,
      stellarTxUrl: payout.stellarTxHash
        ? getExplorerUrl(payout.stellarTxHash)
        : null
    });
  } catch (error) {
    sendError(response, error instanceof Error ? error.message : "Failed to claim payout", 400);
  }
});

export { usersRouter };
