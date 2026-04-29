import { Router } from "express";

import { CampaignStatus, prisma } from "@earnify/db";
import * as StellarSdk from "@stellar/stellar-sdk";

import {
  optionalAuth,
  requireAuth,
  requireRole,
} from "../../middleware/auth.ts";
import { getTopN } from "../services/leaderboard.ts";
import {
  buildEndCampaignTx,
  buildInitializeTx,
  deployCampaignContract,
  getCampaignInfo,
  getContractBalance,
  verifyCampaignFunded,
} from "../services/sorobanClient.ts";
import { executeCampaignPayouts } from "../services/payoutService.ts";
import {
  createCampaignWallet,
  encryptSecretKey,
  getWalletBalance,
} from "../services/stellar.ts";
import { sendError, sendSuccess } from "../utils/api-response.ts";

const campaignsRouter = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toNumber(value: unknown) {
  if (typeof value === "number") {
    return value;
  }

  return Number(value ?? 0);
}

function parseCampaignStatus(value: unknown): CampaignStatus | null {
  if (
    value === CampaignStatus.ACTIVE ||
    value === CampaignStatus.PAUSED ||
    value === CampaignStatus.ENDED ||
    value === CampaignStatus.DRAFT ||
    value === CampaignStatus.COMPLETED
  ) {
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
  return hash
    ? `https://stellar.expert/explorer/testnet/search?term=${encodeURIComponent(hash)}`
    : null;
}

function getExplorerUrl(term: string | null) {
  return term
    ? `https://stellar.expert/explorer/testnet/search?term=${encodeURIComponent(term)}`
    : null;
}

function writeSse(
  response: { write: (chunk: string) => void },
  event: string,
  data: unknown,
) {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}

async function waitForOnChainEnded(
  contractId: string,
  attempts = 8,
  delayMs = 1500,
) {
  for (let index = 0; index < attempts; index += 1) {
    const info = await getCampaignInfo(contractId);
    if (String(info.status).toUpperCase() === "ENDED") {
      return true;
    }

    if (index < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return false;
}

const VALID_PLATFORMS = ["X", "INSTAGRAM", "LINKEDIN", "TWITTER"] as const;
type Platform = (typeof VALID_PLATFORMS)[number];

function parsePlatforms(value: unknown): Platform[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  const platforms = value as unknown[];
  const valid = platforms.every(
    (p) => typeof p === "string" && VALID_PLATFORMS.includes(p as Platform),
  );
  if (!valid) {
    return null;
  }

  return platforms as Platform[];
}

// ---------------------------------------------------------------------------
// POST /api/campaigns — create a DRAFT campaign (founders only)
// ---------------------------------------------------------------------------

campaignsRouter.post(
  "/",
  requireAuth,
  requireRole("FOUNDER"),
  async (request, response) => {
    const {
      title,
      description,
      budget,
      platforms,
      requiredKeywords,
      startDate,
      endDate,
      // Legacy fields still accepted for backward compat with admin/create page
      productUrl,
      totalBudget,
      endsAt,
      founderSecret,
    } = request.body as {
      title?: string;
      description?: string;
      budget?: string | number;
      platforms?: unknown;
      requiredKeywords?: unknown;
      startDate?: string;
      endDate?: string;
      // legacy
      productUrl?: string;
      totalBudget?: number;
      endsAt?: string;
      founderSecret?: string;
    };

    if (!request.user) {
      sendError(response, "Unauthorized", 401);
      return;
    }

    // ---- Determine if this is the new multi-step flow or the legacy admin flow ----
    const isLegacyFlow = Boolean(founderSecret);

    if (isLegacyFlow) {
      // ---- Legacy admin/create flow (deploys contract immediately) ----
      if (
        !title ||
        !description ||
        !productUrl ||
        !totalBudget ||
        !endsAt ||
        !founderSecret
      ) {
        sendError(
          response,
          "Missing required fields: title, description, productUrl, totalBudget, endsAt, founderSecret",
          400,
        );
        return;
      }

      const budgetNum = Number(totalBudget);
      const campaignEnd = new Date(endsAt);

      if (Number.isNaN(budgetNum) || budgetNum <= 0) {
        sendError(response, "totalBudget must be a positive number", 400);
        return;
      }

      if (Number.isNaN(campaignEnd.getTime())) {
        sendError(response, "endsAt must be a valid ISO date", 400);
        return;
      }

      let founderPublicKey: string;
      try {
        founderPublicKey =
          StellarSdk.Keypair.fromSecret(founderSecret).publicKey();
      } catch {
        sendError(
          response,
          "founderSecret must be a valid Stellar secret key",
          400,
        );
        return;
      }

      try {
        const campaign = await prisma.campaign.create({
          data: {
            title: title.trim(),
            description: description.trim(),
            productUrl: productUrl.trim(),
            budget: String(budgetNum),
            totalBudget: budgetNum,
            remainingBudget: budgetNum,
            endsAt: campaignEnd,
            endDate: campaignEnd,
            founderId: request.user.id,
            founderWalletAddress: founderPublicKey,
            stellarWalletPublicKey: founderPublicKey,
            stellarWalletSecretKeyEncrypted: null,
            status: CampaignStatus.DRAFT,
          },
        });

        const deployment = await deployCampaignContract(
          founderSecret,
          budgetNum,
        );

        const updatedCampaign = await prisma.campaign.update({
          where: { id: campaign.id },
          data: {
            contractId: deployment.contractId,
            stellarContractId: deployment.contractId,
            fundingTxHash: deployment.txHash,
            status: CampaignStatus.ACTIVE,
          },
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
            endsAt: updatedCampaign.endsAt?.toISOString() ?? null,
            createdAt: updatedCampaign.createdAt.toISOString(),
            walletAddress: updatedCampaign.stellarWalletPublicKey,
            contractId:
              updatedCampaign.contractId ?? updatedCampaign.stellarContractId,
            fundingTxHash: updatedCampaign.fundingTxHash,
            contractExplorerUrl: updatedCampaign.stellarContractId
              ? getExplorerUrl(updatedCampaign.stellarContractId)
              : null,
            fundingTxUrl: getTxUrl(updatedCampaign.fundingTxHash),
          },
          201,
        );
      } catch (error) {
        console.error(
          "Failed to create campaign and deploy Soroban contract",
          error,
        );
        sendError(response, "Failed to create campaign", 500);
      }

      return;
    }

    // ---- New multi-step flow: save as DRAFT, no contract deployment ----
    const errors: Record<string, string> = {};

    if (!title || title.trim().length === 0) {
      errors.title = "Title is required";
    } else if (title.trim().length < 3) {
      errors.title = "Title must be at least 3 characters";
    }

    if (!description || description.trim().length === 0) {
      errors.description = "Description is required";
    } else if (description.trim().length < 10) {
      errors.description = "Description must be at least 10 characters";
    }

    const parsedPlatforms = parsePlatforms(platforms);
    if (!parsedPlatforms) {
      errors.platforms = `platforms must be a non-empty array of: ${VALID_PLATFORMS.join(", ")}`;
    }

    if (!Array.isArray(requiredKeywords) || requiredKeywords.length === 0) {
      errors.requiredKeywords = "At least one required keyword is needed";
    } else if (
      !(requiredKeywords as unknown[]).every(
        (k) => typeof k === "string" && k.trim().length > 0,
      )
    ) {
      errors.requiredKeywords = "All keywords must be non-empty strings";
    }

    const budgetValue = budget !== undefined ? String(budget).trim() : "";
    const budgetNum = Number(budgetValue);
    if (!budgetValue || Number.isNaN(budgetNum) || budgetNum <= 0) {
      errors.budget = "Budget must be a positive number";
    }

    let parsedStartDate: Date | undefined;
    let parsedEndDate: Date | undefined;

    if (startDate) {
      parsedStartDate = new Date(startDate);
      if (Number.isNaN(parsedStartDate.getTime())) {
        errors.startDate = "startDate must be a valid ISO date";
      }
    }

    if (!endDate) {
      errors.endDate = "End date is required";
    } else {
      parsedEndDate = new Date(endDate);
      if (Number.isNaN(parsedEndDate.getTime())) {
        errors.endDate = "endDate must be a valid ISO date";
      } else if (parsedStartDate && parsedEndDate <= parsedStartDate) {
        errors.endDate = "End date must be after start date";
      } else if (parsedEndDate <= new Date()) {
        errors.endDate = "End date must be in the future";
      }
    }

    if (Object.keys(errors).length > 0) {
      response
        .status(400)
        .json({ success: false, errors, error: "Validation failed" });
      return;
    }

    try {
      const campaignWallet = await createCampaignWallet();

      const campaign = await prisma.campaign.create({
        data: {
          title: (title as string).trim(),
          description: (description as string).trim(),
          budget: budgetValue,
          budgetToken: "XLM",
          platforms: parsedPlatforms as string[],
          requiredKeywords: (requiredKeywords as string[]).map((k: string) =>
            k.trim(),
          ),
          startDate: parsedStartDate ?? null,
          endDate: parsedEndDate!,
          endsAt: parsedEndDate!,
          totalBudget: budgetNum,
          remainingBudget: budgetNum,
          status: CampaignStatus.DRAFT,
          founderId: request.user.id,
          founderWalletAddress: request.user.walletAddress ?? null,
          stellarWalletPublicKey: campaignWallet.publicKey,
          stellarWalletSecretKeyEncrypted: encryptSecretKey(
            campaignWallet.secretKey,
          ),
        },
      });

      sendSuccess(
        response,
        {
          id: campaign.id,
          title: campaign.title,
          description: campaign.description,
          budget: campaign.budget,
          budgetToken: campaign.budgetToken,
          platforms: campaign.platforms,
          requiredKeywords: campaign.requiredKeywords,
          startDate: campaign.startDate?.toISOString() ?? null,
          endDate: campaign.endDate?.toISOString() ?? null,
          status: campaign.status,
          founderId: campaign.founderId,
          founderWalletAddress: campaign.founderWalletAddress,
          contractId: campaign.contractId,
          createdAt: campaign.createdAt.toISOString(),
          updatedAt: campaign.updatedAt.toISOString(),
        },
        201,
      );
    } catch (error) {
      console.error("Failed to create campaign draft", error);
      sendError(response, "Failed to create campaign", 500);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/campaigns — public ACTIVE campaigns + founder's own campaigns
// ---------------------------------------------------------------------------

campaignsRouter.get("/", optionalAuth, async (request, response) => {
  // Try to extract the authenticated user (optional — no hard failure)
  let authenticatedUserId: string | null = null;
  let authenticatedUserRole: string | null = null;

  if (request.user) {
    authenticatedUserId = request.user.id;
    authenticatedUserRole = request.user.role;
  }

  // Founders see all their own campaigns + active campaigns
  if (authenticatedUserRole === "FOUNDER" && authenticatedUserId) {
    const [activeCampaigns, founderCampaigns] = await Promise.all([
      prisma.campaign.findMany({
        where: { status: CampaignStatus.ACTIVE },
        include: {
          _count: { select: { participants: true } },
          founder: { select: { id: true, name: true, avatar: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.campaign.findMany({
        where: { founderId: authenticatedUserId },
        include: {
          _count: { select: { participants: true } },
          founder: { select: { id: true, name: true, avatar: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    // Merge: founder's own campaigns + active campaigns not already in founder list
    const founderIds = new Set(founderCampaigns.map((c) => c.id));
    const merged = [
      ...founderCampaigns,
      ...activeCampaigns.filter((c) => !founderIds.has(c.id)),
    ];

    sendSuccess(
      response,
      merged.map((campaign) => ({
        id: campaign.id,
        title: campaign.title,
        description: campaign.description,
        productUrl: campaign.productUrl,
        budget: campaign.budget,
        budgetToken: campaign.budgetToken,
        platforms: campaign.platforms,
        requiredKeywords: campaign.requiredKeywords,
        startDate: campaign.startDate?.toISOString() ?? null,
        endDate: campaign.endDate?.toISOString() ?? null,
        totalBudget: toNumber(campaign.totalBudget),
        remainingBudget: toNumber(campaign.remainingBudget),
        status: campaign.status,
        founderId: campaign.founderId,
        founder: {
          id: campaign.founder.id,
          name: campaign.founder.name,
          avatar: campaign.founder.avatar,
        },
        founderWalletAddress: campaign.founderWalletAddress,
        contractId: campaign.contractId ?? campaign.stellarContractId,
        endsAt: campaign.endsAt?.toISOString() ?? null,
        createdAt: campaign.createdAt.toISOString(),
        updatedAt: campaign.updatedAt.toISOString(),
        postCount: campaign._count.participants,
        isOwn: campaign.founderId === authenticatedUserId,
      })),
    );

    return;
  }

  // Users see all non-draft campaigns so dashboard tabs can correctly split
  // live/upcoming/ended without missing states.
  if (authenticatedUserRole === "USER" && authenticatedUserId) {
    const campaigns = await prisma.campaign.findMany({
      where: {
        status: { not: CampaignStatus.DRAFT },
      },
      include: {
        _count: { select: { participants: true } },
        founder: { select: { id: true, name: true, avatar: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    sendSuccess(
      response,
      campaigns.map((campaign) => ({
        id: campaign.id,
        title: campaign.title,
        description: campaign.description,
        productUrl: campaign.productUrl,
        budget: campaign.budget,
        budgetToken: campaign.budgetToken,
        platforms: campaign.platforms,
        requiredKeywords: campaign.requiredKeywords,
        startDate: campaign.startDate?.toISOString() ?? null,
        endDate: campaign.endDate?.toISOString() ?? null,
        totalBudget: toNumber(campaign.totalBudget),
        remainingBudget: toNumber(campaign.remainingBudget),
        status: campaign.status,
        founderId: campaign.founderId,
        founder: {
          id: campaign.founder.id,
          name: campaign.founder.name,
          avatar: campaign.founder.avatar,
        },
        contractId: campaign.contractId ?? campaign.stellarContractId,
        endsAt: campaign.endsAt?.toISOString() ?? null,
        createdAt: campaign.createdAt.toISOString(),
        updatedAt: campaign.updatedAt.toISOString(),
        postCount: campaign._count.participants,
      })),
    );

    return;
  }

  // Public: return non-draft campaigns so landing can separate live/upcoming/ended.
  const campaigns = await prisma.campaign.findMany({
    where: { status: { not: CampaignStatus.DRAFT } },
    include: {
      _count: { select: { participants: true } },
      founder: { select: { id: true, name: true, avatar: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  sendSuccess(
    response,
    campaigns.map((campaign) => ({
      id: campaign.id,
      title: campaign.title,
      description: campaign.description,
      productUrl: campaign.productUrl,
      budget: campaign.budget,
      budgetToken: campaign.budgetToken,
      platforms: campaign.platforms,
      requiredKeywords: campaign.requiredKeywords,
      startDate: campaign.startDate?.toISOString() ?? null,
      endDate: campaign.endDate?.toISOString() ?? null,
      totalBudget: toNumber(campaign.totalBudget),
      remainingBudget: toNumber(campaign.remainingBudget),
      status: campaign.status,
      founderId: campaign.founderId,
      founder: {
        id: campaign.founder.id,
        name: campaign.founder.name,
        avatar: campaign.founder.avatar,
      },
      contractId: campaign.contractId ?? campaign.stellarContractId,
      endsAt: campaign.endsAt?.toISOString() ?? null,
      createdAt: campaign.createdAt.toISOString(),
      updatedAt: campaign.updatedAt.toISOString(),
      postCount: campaign._count.participants,
    })),
  );
});

// ---------------------------------------------------------------------------
// GET /api/campaigns/:id
// ---------------------------------------------------------------------------

campaignsRouter.get("/:id", async (request, response) => {
  const campaignId = parseIdParam(request.params.id);

  if (!campaignId) {
    sendError(response, "Campaign id is required", 400);
    return;
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      _count: { select: { participants: true } },
      founder: { select: { id: true, name: true, avatar: true } },
    },
  });

  if (!campaign) {
    sendError(response, "Campaign not found", 404);
    return;
  }

  const topScore = await prisma.score.findFirst({
    where: { campaignId: campaign.id },
    orderBy: { totalScore: "desc" },
    include: {
      user: {
        select: { id: true, name: true, avatar: true },
      },
    },
  });

  sendSuccess(response, {
    id: campaign.id,
    title: campaign.title,
    description: campaign.description,
    productUrl: campaign.productUrl,
    budget: campaign.budget,
    budgetToken: campaign.budgetToken,
    platforms: campaign.platforms,
    requiredKeywords: campaign.requiredKeywords,
    startDate: campaign.startDate?.toISOString() ?? null,
    endDate: campaign.endDate?.toISOString() ?? null,
    totalBudget: toNumber(campaign.totalBudget),
    remainingBudget: toNumber(campaign.remainingBudget),
    status: campaign.status,
    founderId: campaign.founderId,
    founder: {
      id: campaign.founder.id,
      name: campaign.founder.name,
      avatar: campaign.founder.avatar,
    },
    founderWalletAddress: campaign.founderWalletAddress,
    walletAddress: campaign.stellarWalletPublicKey,
    contractId: campaign.contractId ?? campaign.stellarContractId,
    fundingTxHash: campaign.fundingTxHash,
    endsAt: campaign.endsAt?.toISOString() ?? null,
    createdAt: campaign.createdAt.toISOString(),
    updatedAt: campaign.updatedAt.toISOString(),
    stats: {
      postCount: campaign._count.participants,
      remainingBudget: toNumber(campaign.remainingBudget),
      topScorer: topScore
        ? {
            userId: topScore.user.id,
            name: topScore.user.name,
            avatar: topScore.user.avatar,
            score: topScore.totalScore,
          }
        : null,
    },
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/campaigns/:id — update status, contractId, stellarTxHash (founders only)
// ---------------------------------------------------------------------------

campaignsRouter.patch(
  "/:id",
  requireAuth,
  requireRole("FOUNDER"),
  async (request, response) => {
    const campaignId = parseIdParam(request.params.id);

    if (!campaignId) {
      sendError(response, "Campaign id is required", 400);
      return;
    }

    if (!request.user) {
      sendError(response, "Unauthorized", 401);
      return;
    }

    const body = request.body as {
      status?: string;
      contractId?: string;
      stellarTxHash?: string;
    };

    const status = parseCampaignStatus(body.status);
    const incomingContractId =
      typeof body.contractId === "string" ? body.contractId.trim() : undefined;
    const incomingTxHash =
      typeof body.stellarTxHash === "string"
        ? body.stellarTxHash.trim()
        : undefined;

    // At least one field must be provided
    if (!status && !incomingContractId && !incomingTxHash) {
      sendError(
        response,
        "Provide at least one of: status, contractId, stellarTxHash",
        400,
      );
      return;
    }

    if (body.status !== undefined && !status) {
      sendError(
        response,
        "status must be DRAFT, ACTIVE, PAUSED, COMPLETED, or ENDED",
        400,
      );
      return;
    }

    const existingCampaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: {
        founderId: true,
        budget: true,
        contractId: true,
        stellarWalletPublicKey: true,
      },
    });

    if (!existingCampaign) {
      sendError(response, "Campaign not found", 404);
      return;
    }

    if (existingCampaign.founderId !== request.user.id) {
      sendError(response, "Forbidden", 403);
      return;
    }

    // When activating, verify on-chain funding if a contractId is available
    const resolvedContractId =
      incomingContractId ?? existingCampaign.contractId ?? null;
    let walletBalanceAtActivation: number | null = null;

    if (status === CampaignStatus.ACTIVE && resolvedContractId) {
      const expectedBudgetXlm = Number(existingCampaign.budget);
      const expectedBudget = BigInt(Math.round(expectedBudgetXlm * 10_000_000));
      try {
        const [fundedOnContract, campaignWalletBalance] = await Promise.all([
          verifyCampaignFunded(resolvedContractId, expectedBudget),
          existingCampaign.stellarWalletPublicKey
            ? getWalletBalance(existingCampaign.stellarWalletPublicKey)
            : Promise.resolve(0),
        ]);
        walletBalanceAtActivation = campaignWalletBalance;

        const fundedOnWallet = campaignWalletBalance >= expectedBudgetXlm;
        const funded = fundedOnContract || fundedOnWallet;
        if (!funded) {
          // If we already have a submitted initialize tx hash from Freighter,
          // don't hard-block activation on transient RPC lag.
          if (!incomingTxHash) {
            sendError(
              response,
              `On-chain balance does not match expected budget of ${existingCampaign.budget} XLM. ` +
                "Ensure the contract is funded before activating.",
              400,
            );
            return;
          }

          console.warn(
            "verifyCampaignFunded returned false, but funding tx hash was provided; proceeding",
            {
              campaignId,
              contractId: resolvedContractId,
              incomingTxHash,
            },
          );
        }
      } catch (err) {
        // If verification fails (e.g. RPC unavailable), log and proceed — don't block activation
        console.warn("verifyCampaignFunded failed, proceeding anyway:", err);
      }
    }

    const updateData: Record<string, unknown> = {};
    if (status) updateData.status = status;
    if (status === CampaignStatus.ACTIVE) {
      updateData.remainingBudget = Number(existingCampaign.budget);
    }
    if (incomingContractId) {
      updateData.contractId = incomingContractId;
      updateData.stellarContractId = incomingContractId;
    }
    if (incomingTxHash) updateData.fundingTxHash = incomingTxHash;

    const campaign = await prisma.campaign.update({
      where: { id: campaignId },
      data: updateData,
    });

    sendSuccess(response, {
      id: campaign.id,
      status: campaign.status,
      contractId: campaign.contractId ?? campaign.stellarContractId,
      fundingTxHash: campaign.fundingTxHash,
      fundingTxUrl: getTxUrl(campaign.fundingTxHash),
      contractExplorerUrl: campaign.contractId
        ? getExplorerUrl(campaign.contractId)
        : null,
    });
  },
);

// ---------------------------------------------------------------------------
// POST /api/campaigns/:id/deploy-contract
// Deploys the Soroban contract (admin pays) and returns an unsigned XDR
// for the founder to sign with Freighter.
// ---------------------------------------------------------------------------

campaignsRouter.post(
  "/:id/deploy-contract",
  requireAuth,
  requireRole("FOUNDER"),
  async (request, response) => {
    const campaignId = parseIdParam(request.params.id);

    if (!campaignId) {
      sendError(response, "Campaign id is required", 400);
      return;
    }

    if (!request.user) {
      sendError(response, "Unauthorized", 401);
      return;
    }

    const { founderPublicKey } = request.body as { founderPublicKey?: string };

    if (
      !founderPublicKey ||
      !StellarSdk.StrKey.isValidEd25519PublicKey(founderPublicKey)
    ) {
      sendError(
        response,
        "founderPublicKey must be a valid Stellar public key",
        400,
      );
      return;
    }

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: {
        id: true,
        founderId: true,
        budget: true,
        contractId: true,
        stellarContractId: true,
        founderWalletAddress: true,
        stellarWalletPublicKey: true,
        stellarWalletSecretKeyEncrypted: true,
      },
    });

    if (!campaign) {
      sendError(response, "Campaign not found", 404);
      return;
    }

    if (campaign.founderId !== request.user.id) {
      sendError(response, "Forbidden", 403);
      return;
    }

    let campaignWalletAddress = campaign.stellarWalletPublicKey;
    if (!campaignWalletAddress || !campaign.stellarWalletSecretKeyEncrypted) {
      const freshCampaignWallet = await createCampaignWallet();
      const updatedCampaign = await prisma.campaign.update({
        where: { id: campaign.id },
        data: {
          stellarWalletPublicKey: freshCampaignWallet.publicKey,
          stellarWalletSecretKeyEncrypted: encryptSecretKey(
            freshCampaignWallet.secretKey,
          ),
        },
        select: {
          stellarWalletPublicKey: true,
        },
      });

      campaignWalletAddress = updatedCampaign.stellarWalletPublicKey;
    }

    // If already deployed, return the existing contract + a fresh unsigned XDR
    const existingContractId =
      campaign.contractId ?? campaign.stellarContractId;

    try {
      const budgetXlm = Number(campaign.budget);

      if (budgetXlm <= 0) {
        sendError(response, "Campaign budget must be greater than 0", 400);
        return;
      }

      // Deploy contract (admin pays deployment fee) and build unsigned initialize() XDR
      const result = await buildInitializeTx({
        founderPublicKey,
        totalBudgetXLM: budgetXlm,
        existingContractId: existingContractId ?? undefined,
      });

      // Persist the contract id immediately so it's available even if the founder
      // abandons the signing flow and comes back later.
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: {
          contractId: result.contractId,
          stellarContractId: result.contractId,
          founderWalletAddress: founderPublicKey,
        },
      });

      sendSuccess(response, {
        contractId: result.contractId,
        xdr: result.xdr,
        networkPassphrase: result.networkPassphrase,
        campaignWalletAddress,
      });
    } catch (error) {
      console.error("deploy-contract failed", error);
      sendError(
        response,
        error instanceof Error ? error.message : "Contract deployment failed",
        500,
      );
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/campaigns/:id/end-campaign-tx
// Returns unsigned XDR for founder wallet to sign with Freighter.
// ---------------------------------------------------------------------------

campaignsRouter.post(
  "/:id/end-campaign-tx",
  requireAuth,
  requireRole("FOUNDER"),
  async (request, response) => {
    const campaignId = parseIdParam(request.params.id);

    if (!campaignId) {
      sendError(response, "Campaign id is required", 400);
      return;
    }

    if (!request.user) {
      sendError(response, "Unauthorized", 401);
      return;
    }

    const { founderPublicKey } = request.body as { founderPublicKey?: string };
    if (
      !founderPublicKey ||
      !StellarSdk.StrKey.isValidEd25519PublicKey(founderPublicKey)
    ) {
      sendError(
        response,
        "founderPublicKey must be a valid Stellar public key",
        400,
      );
      return;
    }

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: {
        id: true,
        founderId: true,
        status: true,
        contractId: true,
        stellarContractId: true,
        founderWalletAddress: true,
      },
    });

    if (!campaign) {
      sendError(response, "Campaign not found", 404);
      return;
    }

    if (campaign.founderId !== request.user.id) {
      sendError(response, "Forbidden", 403);
      return;
    }

    const resolvedContractId =
      campaign.contractId ?? campaign.stellarContractId;
    if (!resolvedContractId) {
      sendError(response, "Campaign is missing a Soroban contract id", 400);
      return;
    }

    if (
      campaign.founderWalletAddress &&
      campaign.founderWalletAddress !== founderPublicKey
    ) {
      sendError(
        response,
        `Connected wallet does not match campaign founder wallet (${campaign.founderWalletAddress.slice(0, 6)}...${campaign.founderWalletAddress.slice(-6)}).`,
        400,
      );
      return;
    }

    try {
      const onChainInfo = await getCampaignInfo(resolvedContractId);
      const onChainStatus = String(onChainInfo.status).toUpperCase();

      if (onChainStatus === "ENDED") {
        sendSuccess(response, {
          alreadyEnded: true,
          networkPassphrase:
            process.env.STELLAR_NETWORK_PASSPHRASE ??
            StellarSdk.Networks.TESTNET,
        });
        return;
      }

      if (onChainStatus !== "ACTIVE") {
        sendError(
          response,
          `Campaign cannot be ended from on-chain state: ${onChainStatus}`,
          400,
        );
        return;
      }

      const payload = await buildEndCampaignTx({
        founderPublicKey,
        campaignContractId: resolvedContractId,
      });

      sendSuccess(response, {
        ...payload,
        alreadyEnded: false,
      });
    } catch (error) {
      sendError(
        response,
        error instanceof Error
          ? error.message
          : "Failed to build end-campaign tx",
        500,
      );
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/campaigns/:id/leaderboard
// Returns top 50 participants with rank, score, estimated earnings, platforms
// ---------------------------------------------------------------------------

campaignsRouter.get("/:id/leaderboard", async (request, response) => {
  const campaignId = parseIdParam(request.params.id);

  if (!campaignId) {
    sendError(response, "Campaign id is required", 400);
    return;
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true },
  });

  if (!campaign) {
    sendError(response, "Campaign not found", 404);
    return;
  }

  const leaderboard = await getTopN(campaign.id, 50);
  sendSuccess(response, leaderboard);
});

// ---------------------------------------------------------------------------
// GET /api/campaigns/:id/payout (SSE) — founders only
// ---------------------------------------------------------------------------

campaignsRouter.get(
  "/:id/payout",
  requireAuth,
  requireRole("FOUNDER"),
  async (request, response) => {
    const campaignId = parseIdParam(request.params.id);
    const endTxHashRaw = request.query.endTxHash;
    const endTxHash = typeof endTxHashRaw === "string" ? endTxHashRaw : null;

    if (!campaignId) {
      sendError(response, "Campaign id is required", 400);
      return;
    }

    if (!request.user) {
      sendError(response, "Unauthorized", 401);
      return;
    }

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: {
        id: true,
        founderId: true,
        stellarContractId: true,
        contractId: true,
        remainingBudget: true,
        stellarWalletPublicKey: true,
      },
    });

    if (!campaign) {
      sendError(response, "Campaign not found", 404);
      return;
    }

    if (campaign.founderId !== request.user.id) {
      sendError(response, "Forbidden", 403);
      return;
    }

    const resolvedContractId =
      campaign.contractId ?? campaign.stellarContractId;

    if (!resolvedContractId) {
      sendError(response, "Campaign is missing a Soroban contract id", 400);
      return;
    }

    response.setHeader("Content-Type", "text/event-stream");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    response.setHeader("X-Accel-Buffering", "no");
    response.flushHeaders();

    try {
      const endedConfirmed = await waitForOnChainEnded(resolvedContractId);
      if (!endedConfirmed) {
        writeSse(response, "payout-error", {
          message:
            "Campaign end transaction is still confirming on-chain. Please wait a few seconds and retry.",
        });
        return;
      }

      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: CampaignStatus.ENDED },
      });

      writeSse(response, "campaign-ended", {
        txHash: endTxHash,
        txUrl: getTxUrl(endTxHash),
      });

      const payoutExecution = await executeCampaignPayouts(campaign.id, {
        allowManualTrigger: true,
      });
      for (const payout of payoutExecution.payouts) {
        writeSse(response, "payout", {
          payoutId: payout.payoutId,
          creatorId: payout.userId,
          creatorName: payout.userName,
          amountXLM: payout.amount,
          status: payout.status,
          txHash: payout.stellarTxHash,
          txUrl: payout.stellarTxUrl,
        });
      }
      if (payoutExecution.refund) {
        writeSse(response, "refund", {
          destination: payoutExecution.refund.destination || null,
          amountXLM: payoutExecution.refund.amount,
          status: payoutExecution.refund.status,
          txHash: payoutExecution.refund.stellarTxHash,
          txUrl: payoutExecution.refund.stellarTxUrl,
        });
      }

      const currentRemainingBudget = toNumber(campaign.remainingBudget);
      const nextRemainingBudget = Math.max(
        0,
        Number(
          (currentRemainingBudget - payoutExecution.distributedBudget).toFixed(
            7,
          ),
        ),
      );

      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { remainingBudget: nextRemainingBudget },
      });

      writeSse(response, "done", {
        campaignId: campaign.id,
        contractId: resolvedContractId,
        balanceXLM: nextRemainingBudget,
        distributedBudget: payoutExecution.distributedBudget,
      });
    } catch (error) {
      writeSse(response, "payout-error", {
        message:
          error instanceof Error ? error.message : "Failed to execute payout",
      });
    } finally {
      response.end();
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/campaigns/:id/contract-info
// ---------------------------------------------------------------------------

campaignsRouter.get(
  "/:id/contract-info",
  requireAuth,
  async (request, response) => {
    const campaignId = parseIdParam(request.params.id);

    if (!campaignId) {
      sendError(response, "Campaign id is required", 400);
      return;
    }

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: {
        stellarContractId: true,
        contractId: true,
        stellarWalletPublicKey: true,
      },
    });

    if (!campaign) {
      sendError(response, "Campaign not found", 404);
      return;
    }

    const resolvedContractId =
      campaign.contractId ?? campaign.stellarContractId;

    if (!resolvedContractId) {
      sendError(response, "Campaign is missing a Soroban contract id", 400);
      return;
    }

    try {
      const [contractBalance, walletBalance, contractInfo] = await Promise.all([
        getContractBalance(resolvedContractId),
        campaign.stellarWalletPublicKey
          ? getWalletBalance(campaign.stellarWalletPublicKey)
          : Promise.resolve(0),
        getCampaignInfo(resolvedContractId),
      ]);

      sendSuccess(response, {
        contractId: resolvedContractId,
        balance: walletBalance,
        contractBalance,
        campaignWalletAddress: campaign.stellarWalletPublicKey,
        status: contractInfo.status,
        creatorScores: contractInfo.creatorScores,
        explorerUrl: getExplorerUrl(resolvedContractId),
      });
    } catch (error) {
      sendError(
        response,
        error instanceof Error
          ? error.message
          : "Failed to fetch on-chain contract info",
        500,
      );
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/campaigns/:id/payouts
// ---------------------------------------------------------------------------

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
    where: { id: campaignId },
    select: { id: true, founderId: true },
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
    where: { campaignId: campaign.id },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
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
        ? getTxUrl(payout.stellarTxHash)
        : null,
      createdAt: payout.createdAt.toISOString(),
    })),
  );
});

export { campaignsRouter };
