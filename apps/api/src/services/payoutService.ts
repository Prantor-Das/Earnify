import * as StellarSdk from "@stellar/stellar-sdk";
import { CampaignStatus, PayoutStatus, prisma } from "@earnify/db";

import { decryptSecretKey } from "./stellar.ts";
import { emitPayoutUpdate } from "../websocket.ts";

const HORIZON_URL = "https://horizon-testnet.stellar.org";
const NETWORK_PASSPHRASE = StellarSdk.Networks.TESTNET;
const STELLAR_EXPERT_BASE_URL = "https://stellar.expert/explorer/testnet/search?term=";

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

type CampaignRefundResult = {
  destination: string;
  amount: number;
  status: "COMPLETED" | "FAILED" | "SKIPPED";
  stellarTxHash: string | null;
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

function extractHorizonErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Unknown payout transfer error";
  }

  const err = error as Error & {
    response?: {
      data?: {
        detail?: string;
        extras?: {
          result_codes?: {
            transaction?: string;
            operations?: string[];
          };
        };
      };
    };
  };

  const detail = err.response?.data?.detail;
  const txCode = err.response?.data?.extras?.result_codes?.transaction;
  const opCodes = err.response?.data?.extras?.result_codes?.operations;
  const opCodeText = Array.isArray(opCodes) && opCodes.length > 0 ? opCodes.join(",") : null;

  if (detail && txCode && opCodeText) {
    return `${detail} (tx=${txCode}, op=${opCodeText})`;
  }

  if (detail && txCode) {
    return `${detail} (tx=${txCode})`;
  }

  if (detail) {
    return detail;
  }

  return err.message || "Unknown payout transfer error";
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

async function getWalletNativeBalance(publicKey: string): Promise<number> {
  const account = await horizon.loadAccount(publicKey);
  const native = account.balances.find((balance: { asset_type: string; balance: string }) => balance.asset_type === "native");
  return Number(native?.balance ?? "0");
}

function allocatePayouts(entries: CampaignScoreEntry[], totalBudget: number) {
  const totalScore = entries.reduce((sum, entry) => sum + entry.score, 0);

  if (totalBudget <= 0) {
    return entries.map((entry) => ({
      ...entry,
      amount: 0
    }));
  }

  if (totalScore <= 0) {
    if (entries.length === 0) {
      return [];
    }

    const evenShare = roundPayoutAmount(totalBudget / entries.length);
    const allocations = entries.map((entry, index) => {
      if (index === entries.length - 1) {
        const allocated = evenShare * (entries.length - 1);
        return {
          ...entry,
          amount: roundPayoutAmount(totalBudget - allocated)
        };
      }

      return {
        ...entry,
        amount: evenShare
      };
    });

    return allocations;
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

  const [participantRows, verifiedPostRows] = await Promise.all([
    prisma.campaignParticipant.findMany({
      where: { campaignId },
      select: { userId: true }
    }),
    prisma.post.findMany({
      where: { campaignId, status: "VERIFIED" },
      select: { userId: true },
      distinct: ["userId"]
    })
  ]);

  const scoreByUserId = new Map(groupedScores.map((entry) => [entry.userId, entry._sum.totalScore ?? 0]));
  const userIds = Array.from(
    new Set([
      ...groupedScores.map((entry) => entry.userId),
      ...participantRows.map((entry) => entry.userId),
      ...verifiedPostRows.map((entry) => entry.userId)
    ])
  );

  if (userIds.length === 0) {
    return [];
  }

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

  return userIds
    .map((userId) => {
      const user = userById.get(userId);

      if (!user) {
        return null;
      }

      return {
        userId: user.id,
        userName: user.name,
        walletAddress: user.walletAddress,
        score: scoreByUserId.get(user.id) ?? 0
      };
    })
    .filter((entry): entry is CampaignScoreEntry => entry !== null)
    .filter((entry) => entry.score >= 0);
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
      founderId: true,
      status: true,
      remainingBudget: true,
      stellarWalletSecretKeyEncrypted: true,
      founderWalletAddress: true,
      founder: {
        select: {
          walletAddress: true
        }
      }
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
  const sourceSecretKey = decryptSecretKey(campaign.stellarWalletSecretKeyEncrypted);

  const scoreEntries = (await getCampaignScoreEntries(campaign.id)).filter((entry) => entry.userId !== campaign.founderId);
  const allocated = allocatePayouts(scoreEntries, campaignBudget).filter((entry) => entry.amount > 0);

  const results: PayoutExecutionResult[] = [];
  let distributedBudget = 0;

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
      distributedBudget += entry.amount;
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

  let refund: CampaignRefundResult | null = null;
  const founderWallet = campaign.founder.walletAddress ?? campaign.founderWalletAddress ?? null;
  const hasPayoutRecipients = allocated.length > 0;

  if (!hasPayoutRecipients && founderWallet && campaignBudget > 0) {
    try {
      const txHash = await submitXlmPayment(sourceSecretKey, founderWallet, campaignBudget);
      distributedBudget += campaignBudget;
      refund = {
        destination: founderWallet,
        amount: campaignBudget,
        status: "COMPLETED",
        stellarTxHash: txHash
      };
    } catch {
      refund = {
        destination: founderWallet,
        amount: campaignBudget,
        status: "FAILED",
        stellarTxHash: null
      };
    }
  } else if (!hasPayoutRecipients && !founderWallet && campaignBudget > 0) {
    refund = {
      destination: "",
      amount: campaignBudget,
      status: "SKIPPED",
      stellarTxHash: null
    };
  }

  await prisma.campaign.update({
    where: {
      id: campaign.id
    },
    data: {
      status: CampaignStatus.ENDED
    }
  });

  return {
    campaignId: campaign.id,
    distributedBudget,
    refund: refund
      ? {
          ...refund,
          stellarTxUrl: getExplorerUrl(refund.stellarTxHash)
        }
      : null,
    payouts: results.map((entry) => ({
      ...entry,
      stellarTxUrl: getExplorerUrl(entry.stellarTxHash)
    }))
  };
}

async function claimPayout(userId: string, campaignId: string) {
  const payoutSelection = {
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
    },
    orderBy: {
      createdAt: "asc"
    }
  } as const;

  const pendingPayout =
    (await prisma.payout.findFirst({
      where: {
        userId,
        campaignId,
        status: "PENDING"
      },
      ...payoutSelection
    })) ??
    (await prisma.payout.findFirst({
      where: {
        userId,
        campaignId,
        status: "FAILED"
      },
      ...payoutSelection
    }));

  if (!pendingPayout) {
    throw new Error("No pending or failed payout found");
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
      stellarTxUrl: getExplorerUrl(completed.stellarTxHash)
    };

    emitPayoutUpdate(completed.campaignId, {
      userId: completed.userId,
      userName: pendingPayout.user.name,
      amount: toNumber(completed.amount),
      status: completed.status,
      stellarTxHash: completed.stellarTxHash
    });

    return result;
  } catch (error) {
    await prisma.payout.update({
      where: {
        id: pendingPayout.id
      },
      data: {
        status: "FAILED"
      }
    });

    let reason = extractHorizonErrorMessage(error);
    if (reason.includes("op_underfunded")) {
      try {
        const sourcePublicKey = StellarSdk.Keypair
          .fromSecret(decryptSecretKey(pendingPayout.campaign.stellarWalletSecretKeyEncrypted))
          .publicKey();
        const sourceBalance = await getWalletNativeBalance(sourcePublicKey);
        const requestedAmount = toNumber(pendingPayout.amount);
        reason = `Source campaign wallet is underfunded for this transfer. Balance=${sourceBalance.toFixed(7)} XLM, requested=${requestedAmount.toFixed(7)} XLM (plus fees/reserve).`;
      } catch {
        // Keep original Horizon reason if live balance lookup fails.
      }
    }
    console.error("claimPayout failed", {
      payoutId: pendingPayout.id,
      campaignId,
      userId,
      destination: pendingPayout.user.walletAddress,
      amount: toNumber(pendingPayout.amount),
      reason
    });
    throw new Error(`Failed to claim payout: ${reason}`);
  }
}

export { claimPayout, executeCampaignPayouts };
function getExplorerUrl(term: string | null) {
  return term ? `${STELLAR_EXPERT_BASE_URL}${encodeURIComponent(term)}` : null;
}
