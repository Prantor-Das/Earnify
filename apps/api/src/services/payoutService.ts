import * as StellarSdk from "@stellar/stellar-sdk";
import { CampaignStatus, PayoutStatus, prisma } from "@earnify/db";

import { decryptSecretKey } from "./stellar.ts";
import { emitPayoutUpdate } from "../websocket.ts";

const HORIZON_URL = "https://horizon-testnet.stellar.org";
const NETWORK_PASSPHRASE = StellarSdk.Networks.TESTNET;
const STELLAR_EXPERT_BASE_URL = "https://testnet.stellar.expert/explorer/testnet/tx";

const horizon = new StellarSdk.Horizon.Server(HORIZON_URL);

type CampaignScoreEntry = {
  userId: string;
  userName: string;
  walletAddress: string | null;
  score: number;
};

type PayoutExecutionResult = {
  userId: string;
  userName: string;
  amount: number;
  status: PayoutStatus;
  stellarTxHash: string | null;
  payoutId: string;
};

type ExecutePayoutOptions = {
  allowManualTrigger?: boolean;
};

function toNumber(value: unknown) {
  if (typeof value === "number") {
    return value;
  }

  return Number(value ?? 0);
}

function formatStellarAmount(value: number) {
  return value.toFixed(7);
}

function roundPayoutAmount(value: number) {
  return Math.max(0, Number(value.toFixed(7)));
}

async function submitXlmPayment(sourceSecretKey: string, destination: string, amount: number) {
  const sourceKeypair = StellarSdk.Keypair.fromSecret(sourceSecretKey);
  const sourceAccount = await horizon.loadAccount(sourceKeypair.publicKey());

  const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
    fee: String(await horizon.fetchBaseFee()),
    networkPassphrase: NETWORK_PASSPHRASE
  })
    .addOperation(
      StellarSdk.Operation.payment({
        destination,
        asset: StellarSdk.Asset.native(),
        amount: formatStellarAmount(amount)
      })
    )
    .setTimeout(30)
    .build();

  transaction.sign(sourceKeypair);

  const result = await horizon.submitTransaction(transaction);
  return result.hash;
}

function allocatePayouts(entries: CampaignScoreEntry[], totalBudget: number) {
  const totalScore = entries.reduce((sum, entry) => sum + entry.score, 0);

  if (totalScore <= 0 || totalBudget <= 0) {
    return entries.map((entry) => ({
      ...entry,
      amount: 0
    }));
  }

  let allocated = 0;

  const allocations = entries.map((entry, index) => {
    if (index === entries.length - 1) {
      const remaining = roundPayoutAmount(totalBudget - allocated);
      return {
        ...entry,
        amount: remaining
      };
    }

    const amount = roundPayoutAmount((entry.score / totalScore) * totalBudget);
    allocated += amount;

    return {
      ...entry,
      amount
    };
  });

  return allocations;
}

async function getCampaignScoreEntries(campaignId: string): Promise<CampaignScoreEntry[]> {
  const groupedScores = await prisma.score.groupBy({
    by: ["userId", "campaignId"],
    where: {
      campaignId
    },
    _sum: {
      totalScore: true
    }
  });

  if (groupedScores.length === 0) {
    return [];
  }

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

  const userById = new Map(users.map((user) => [user.id, user]));

  return groupedScores
    .map((entry) => {
      const user = userById.get(entry.userId);

      if (!user) {
        return null;
      }

      return {
        userId: user.id,
        userName: user.name,
        walletAddress: user.walletAddress,
        score: entry._sum.totalScore ?? 0
      };
    })
    .filter((entry): entry is CampaignScoreEntry => entry !== null)
    .filter((entry) => entry.score > 0);
}

async function createPayoutRecord(input: {
  userId: string;
  campaignId: string;
  amount: number;
  status: PayoutStatus;
  stellarTxHash: string | null;
}) {
  return prisma.payout.create({
    data: {
      userId: input.userId,
      campaignId: input.campaignId,
      amount: input.amount,
      status: input.status,
      stellarTxHash: input.stellarTxHash
    }
  });
}

async function executeCampaignPayouts(campaignId: string, options: ExecutePayoutOptions = {}) {
  const campaign = await prisma.campaign.findUnique({
    where: {
      id: campaignId
    },
    select: {
      id: true,
      status: true,
      remainingBudget: true,
      stellarWalletSecretKeyEncrypted: true
    }
  });

  if (!campaign) {
    throw new Error("Campaign not found");
  }

  if (!options.allowManualTrigger && campaign.status !== CampaignStatus.ENDED) {
    throw new Error("Campaign must be ENDED before payout");
  }

  if (!campaign.stellarWalletSecretKeyEncrypted) {
    throw new Error("Campaign wallet secret key is missing");
  }

  const campaignBudget = toNumber(campaign.remainingBudget);
  const scoreEntries = await getCampaignScoreEntries(campaign.id);
  const allocated = allocatePayouts(scoreEntries, campaignBudget).filter((entry) => entry.amount > 0);

  const sourceSecretKey = decryptSecretKey(campaign.stellarWalletSecretKeyEncrypted);
  const results: PayoutExecutionResult[] = [];

  for (const entry of allocated) {
    if (!entry.walletAddress) {
      const pendingPayout = await createPayoutRecord({
        userId: entry.userId,
        campaignId: campaign.id,
        amount: entry.amount,
        status: "PENDING",
        stellarTxHash: null
      });

      const result: PayoutExecutionResult = {
        userId: entry.userId,
        userName: entry.userName,
        amount: entry.amount,
        status: "PENDING",
        stellarTxHash: null,
        payoutId: pendingPayout.id
      };

      results.push(result);
      emitPayoutUpdate(campaign.id, result);
      continue;
    }

    try {
      const txHash = await submitXlmPayment(sourceSecretKey, entry.walletAddress, entry.amount);
      const completedPayout = await createPayoutRecord({
        userId: entry.userId,
        campaignId: campaign.id,
        amount: entry.amount,
        status: "COMPLETED",
        stellarTxHash: txHash
      });

      const result: PayoutExecutionResult = {
        userId: entry.userId,
        userName: entry.userName,
        amount: entry.amount,
        status: "COMPLETED",
        stellarTxHash: txHash,
        payoutId: completedPayout.id
      };

      results.push(result);
      emitPayoutUpdate(campaign.id, result);
    } catch {
      const failedPayout = await createPayoutRecord({
        userId: entry.userId,
        campaignId: campaign.id,
        amount: entry.amount,
        status: "FAILED",
        stellarTxHash: null
      });

      const result: PayoutExecutionResult = {
        userId: entry.userId,
        userName: entry.userName,
        amount: entry.amount,
        status: "FAILED",
        stellarTxHash: null,
        payoutId: failedPayout.id
      };

      results.push(result);
      emitPayoutUpdate(campaign.id, result);
    }
  }

  await prisma.campaign.update({
    where: {
      id: campaign.id
    },
    data: {
      remainingBudget: 0,
      status: CampaignStatus.ENDED
    }
  });

  return {
    campaignId: campaign.id,
    distributedBudget: campaignBudget,
    payouts: results.map((entry) => ({
      ...entry,
      stellarTxUrl: entry.stellarTxHash ? `${STELLAR_EXPERT_BASE_URL}/${entry.stellarTxHash}` : null
    }))
  };
}

async function claimPayout(userId: string, campaignId: string) {
  const pendingPayout = await prisma.payout.findFirst({
    where: {
      userId,
      campaignId,
      status: "PENDING"
    },
    orderBy: {
      createdAt: "asc"
    },
    include: {
      campaign: {
        select: {
          stellarWalletSecretKeyEncrypted: true
        }
      },
      user: {
        select: {
          walletAddress: true,
          name: true
        }
      }
    }
  });

  if (!pendingPayout) {
    throw new Error("No pending payout found");
  }

  if (!pendingPayout.user.walletAddress) {
    throw new Error("Wallet address is required to claim payout");
  }

  if (!pendingPayout.campaign.stellarWalletSecretKeyEncrypted) {
    throw new Error("Campaign wallet secret key is missing");
  }

  try {
    const txHash = await submitXlmPayment(
      decryptSecretKey(pendingPayout.campaign.stellarWalletSecretKeyEncrypted),
      pendingPayout.user.walletAddress,
      toNumber(pendingPayout.amount)
    );

    const completed = await prisma.payout.update({
      where: {
        id: pendingPayout.id
      },
      data: {
        status: "COMPLETED",
        stellarTxHash: txHash
      }
    });

    const result = {
      id: completed.id,
      userId: completed.userId,
      campaignId: completed.campaignId,
      amount: toNumber(completed.amount),
      status: completed.status,
      stellarTxHash: completed.stellarTxHash,
      stellarTxUrl: completed.stellarTxHash ? `${STELLAR_EXPERT_BASE_URL}/${completed.stellarTxHash}` : null
    };

    emitPayoutUpdate(completed.campaignId, {
      userId: completed.userId,
      userName: pendingPayout.user.name,
      amount: toNumber(completed.amount),
      status: completed.status,
      stellarTxHash: completed.stellarTxHash
    });

    return result;
  } catch {
    await prisma.payout.update({
      where: {
        id: pendingPayout.id
      },
      data: {
        status: "FAILED"
      }
    });

    throw new Error("Failed to claim payout");
  }
}

export { claimPayout, executeCampaignPayouts };
