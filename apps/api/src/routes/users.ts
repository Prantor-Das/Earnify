import { Router } from "express";

import { prisma } from "@earnify/db";
import * as StellarSdk from "@stellar/stellar-sdk";

import { requireAuth } from "../../middleware/auth.ts";
import { triggerCreatorPayout } from "../services/sorobanClient.ts";
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

usersRouter.post("/:id/payouts/:campaignId/claim", requireAuth, async (request, response) => {
  const userId = parseIdParam(request.params.id);
  const campaignId = parseIdParam(request.params.campaignId);
  const creatorSecret = (request.body as { creatorSecret?: string }).creatorSecret;

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

  if (!creatorSecret) {
    sendError(response, "creatorSecret is required", 400);
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

  if (!campaign?.stellarContractId) {
    sendError(response, "Campaign contract not found", 404);
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

  if (!user?.walletAddress) {
    sendError(response, "Wallet address is required to claim payout", 400);
    return;
  }

  let secretPublicKey: string;
  try {
    secretPublicKey = StellarSdk.Keypair.fromSecret(creatorSecret).publicKey();
  } catch {
    sendError(response, "creatorSecret must be a valid Stellar secret key", 400);
    return;
  }

  if (secretPublicKey !== user.walletAddress) {
    sendError(response, "creatorSecret does not match your connected wallet", 400);
    return;
  }

  try {
    const result = await triggerCreatorPayout(campaign.stellarContractId, creatorSecret);

    const payout = await prisma.payout.create({
      data: {
        userId,
        campaignId,
        amount: result.amountXLM,
        status: "COMPLETED",
        stellarTxHash: result.txHash
      }
    });

    sendSuccess(response, {
      id: payout.id,
      status: payout.status,
      amount: toNumber(payout.amount),
      stellarTxHash: payout.stellarTxHash,
      stellarTxUrl: payout.stellarTxHash
        ? `https://testnet.stellar.expert/explorer/testnet/tx/${payout.stellarTxHash}`
        : null
    });
  } catch (error) {
    sendError(response, error instanceof Error ? error.message : "Failed to claim payout", 400);
  }
});

export { usersRouter };
