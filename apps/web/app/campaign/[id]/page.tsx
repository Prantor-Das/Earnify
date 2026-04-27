"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

import type { ApiResponse, CampaignStatus, LeaderboardEntry, PostStatus, SocialPlatform } from "@earnify/shared";
import { useParams } from "next/navigation";
import { FundCampaignStep } from "../../../components/campaign/FundCampaignStep";
import { BudgetBar } from "../../../components/BudgetBar";
import { EmptyState } from "../../../components/EmptyState";
import { ErrorBoundary } from "../../../components/ErrorBoundary";
import { Leaderboard } from "../../../components/Leaderboard";
import { Skeleton } from "../../../components/Skeleton";
import { StatusBadge } from "../../../components/StatusBadge";
import { useAuth } from "../../../components/auth/useAuth";
import { withAuth } from "../../../components/auth/withAuth";
import { useToast } from "../../../components/toast/ToastProvider";
import { useWallet } from "../../../components/wallet/WalletProvider";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
const HORIZON_URL = process.env.NEXT_PUBLIC_STELLAR_HORIZON_URL ?? "https://horizon-testnet.stellar.org";
const NETWORK_PASSPHRASE =
  process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE ?? "Test SDF Network ; September 2015";
const FOUNDER_FEE_BUFFER_XLM = 10;

type CampaignDetails = {
  id: string;
  founderId: string;
  title: string;
  description: string;
  totalBudget: number;
  remainingBudget: number;
  status: CampaignStatus;
  contractId?: string | null;
  fundingTxHash?: string | null;
  budget?: string | null;
  budgetToken?: string | null;
  stats: {
    postCount: number;
    remainingBudget: number;
    topScorer: {
      userId: string;
      name: string;
      avatar?: string | null;
      score: number;
    } | null;
  };
};

type PostSubmissionResponse = {
  postId: string;
  status: PostStatus;
};

type PostStatusResponse = {
  postId: string;
  status: PostStatus;
  rejectionReason?: string | null;
};

type SubmissionPhase = "idle" | "submitting" | "pending" | "verified" | "rejected" | "error";

type PayoutStatus = "PENDING" | "COMPLETED" | "FAILED";

type CampaignPayoutEntry = {
  id: string;
  campaignId: string;
  userId: string;
  userName: string;
  amount: number;
  status: PayoutStatus;
  stellarTxHash: string | null;
  stellarTxUrl: string | null;
  createdAt: string;
};

type ContractInfo = {
  contractId: string;
  balance: number;
  status: string;
  creatorScores: Record<string, number>;
  explorerUrl: string;
};

type FreighterSignFn = (
  xdr: string,
  opts: { networkPassphrase: string }
) => Promise<{ signedTxXdr: string; error?: string }>;

async function getFreighterSign(): Promise<FreighterSignFn | null> {
  try {
    const mod = await import("@stellar/freighter-api");
    const api = (mod as unknown as { freighterApi?: { signTransaction: FreighterSignFn } }).freighterApi
      ?? (mod as unknown as { signTransaction: FreighterSignFn });
    if (typeof api?.signTransaction === "function") return api.signTransaction.bind(api);
    return null;
  } catch {
    return null;
  }
}

function truncateAddress(value: string) {
  return `${value.slice(0, 6)}...${value.slice(-6)}`;
}

function getPayoutStatusStyle(status: PayoutStatus) {
  if (status === "COMPLETED") {
    return {
      color: "var(--color-success)",
      background: "color-mix(in srgb, var(--color-success) 16%, var(--color-surface))",
      borderColor: "color-mix(in srgb, var(--color-success) 42%, var(--color-border))"
    };
  }

  if (status === "FAILED") {
    return {
      color: "var(--color-danger)",
      background: "color-mix(in srgb, var(--color-danger) 14%, var(--color-surface))",
      borderColor: "color-mix(in srgb, var(--color-danger) 38%, var(--color-border))"
    };
  }

  return {
    color: "var(--color-accent)",
    background: "color-mix(in srgb, var(--color-accent) 18%, var(--color-surface))",
    borderColor: "color-mix(in srgb, var(--color-accent) 42%, var(--color-border))"
  };
}

function CampaignNotFoundFallback({ message = "Campaign not found" }: { message?: string }) {
  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 md:py-12 lg:px-10">
      <section className="mx-auto w-full max-w-3xl rounded-3xl border border-[var(--color-border)]/50 bg-[#0D0F14]/50 backdrop-blur-xl p-12 text-center shadow-2xl">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--color-primary)]">404</p>
        <h1 className="mt-4 text-3xl font-bold text-white">Campaign unavailable</h1>
        <p className="mt-3 text-base text-[var(--color-muted)]">{message}</p>
      </section>
    </main>
  );
}

function LeaderboardFallback() {
  return (
    <div className="rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 p-5 text-sm text-[var(--color-danger)] font-medium">Leaderboard temporarily unavailable</div>
  );
}

function PostSubmissionFallback() {
  return <div className="rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 p-5 text-sm text-[var(--color-danger)] font-medium">Try again</div>;
}

function CampaignDetailsPage() {
  const { user } = useAuth();
  const { pushToast } = useToast();
  const { walletAddress, isConnected: walletConnected } = useWallet();
  const params = useParams<{ id: string }>();
  const campaignId = params.id;

  const [campaign, setCampaign] = useState<CampaignDetails | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  const [loadingCampaign, setLoadingCampaign] = useState(true);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [campaignMissing, setCampaignMissing] = useState(false);

  const [postUrl, setPostUrl] = useState("");
  const [platform, setPlatform] = useState<SocialPlatform>("TWITTER");
  const [submissionPhase, setSubmissionPhase] = useState<SubmissionPhase>("idle");
  const [submittedPostId, setSubmittedPostId] = useState<string | null>(null);
  const [submissionMessage, setSubmissionMessage] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);

  const [payouts, setPayouts] = useState<CampaignPayoutEntry[]>([]);
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutError, setPayoutError] = useState<string | null>(null);
  const [showPayoutConfirm, setShowPayoutConfirm] = useState(false);
  const [triggeringPayout, setTriggeringPayout] = useState(false);
  const [payoutStreaming, setPayoutStreaming] = useState(false);
  const [contractInfo, setContractInfo] = useState<ContractInfo | null>(null);

  useEffect(() => {
    if (!campaignId) {
      return;
    }

    const fetchCampaignAndLeaderboard = async () => {
      setLoadingCampaign(true);
      setLoadingLeaderboard(true);
      setError(null);
      setCampaignMissing(false);

      try {
        const [campaignResponse, leaderboardResponse] = await Promise.all([
          fetch(`${apiBaseUrl}/api/campaigns/${campaignId}`, {
            method: "GET",
            credentials: "include"
          }),
          fetch(`${apiBaseUrl}/api/campaigns/${campaignId}/leaderboard`, {
            method: "GET",
            credentials: "include"
          })
        ]);

        const campaignPayload = (await campaignResponse.json()) as ApiResponse<CampaignDetails>;
        const leaderboardPayload = (await leaderboardResponse.json()) as ApiResponse<LeaderboardEntry[]>;

        if (!campaignResponse.ok || !campaignPayload.success || !campaignPayload.data) {
          const errorMessage = campaignPayload.error ?? "Unable to load campaign";
          setCampaign(null);
          setError(errorMessage);
          setCampaignMissing(campaignResponse.status === 404 || errorMessage.toLowerCase().includes("not found"));
          return;
        }

        setCampaign(campaignPayload.data);

        if (leaderboardResponse.ok && leaderboardPayload.success && leaderboardPayload.data) {
          setLeaderboard(leaderboardPayload.data);
        }
      } catch {
        setCampaign(null);
        setError("Unable to load campaign");
        setCampaignMissing(false);
      } finally {
        setLoadingCampaign(false);
        setLoadingLeaderboard(false);
      }
    };

    void fetchCampaignAndLeaderboard();
  }, [campaignId]);

  const topScorerText = useMemo(() => {
    if (!campaign?.stats.topScorer) {
      return "No scores submitted yet";
    }

    return `${campaign.stats.topScorer.name} (${campaign.stats.topScorer.score.toFixed(2)} pts)`;
  }, [campaign?.stats.topScorer]);

  const isFounderView = user?.role === "FOUNDER" && campaign?.founderId === user.id;
  const isCampaignEnded = campaign?.status === "ENDED" || campaign?.status === "COMPLETED";
  const canSubmitPost = !isFounderView && campaign?.status === "ACTIVE";
  const flowSteps = [
    { title: "1. Funded", done: Boolean(campaign?.contractId), detail: "Contract deployed and campaign wallet funded." },
    { title: "2. Participate", done: (campaign?.stats.postCount ?? 0) > 0, detail: "Creators submit and verify campaign posts." },
    { title: "3. Settle", done: campaign?.status === "ENDED", detail: "Campaign ends and remaining pool is settled." }
  ];

  useEffect(() => {
    if (!campaignId || !isFounderView) {
      setPayouts([]);
      return;
    }

    const fetchPayouts = async () => {
      setPayoutLoading(true);
      setPayoutError(null);

      try {
        const response = await fetch(`${apiBaseUrl}/api/campaigns/${campaignId}/payouts`, {
          method: "GET",
          credentials: "include"
        });

        const payload = (await response.json()) as ApiResponse<CampaignPayoutEntry[]>;

        if (!response.ok || !payload.success || !payload.data) {
          setPayoutError(payload.error ?? "Failed to load payouts");
          return;
        }

        setPayouts(payload.data);
      } catch {
        setPayoutError("Failed to load payouts");
      } finally {
        setPayoutLoading(false);
      }
    };

    void fetchPayouts();
  }, [campaignId, isFounderView]);

  useEffect(() => {
    if (!campaignId) {
      return;
    }

    let cancelled = false;

    const fetchContractInfo = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/api/campaigns/${campaignId}/contract-info`, {
          method: "GET",
          credentials: "include"
        });

        const payload = (await response.json()) as ApiResponse<ContractInfo>;

        if (!cancelled && response.ok && payload.success && payload.data) {
          setContractInfo(payload.data);
        }
      } catch {
        // keep last successful contract snapshot in UI
      }
    };

    void fetchContractInfo();
    const intervalId = window.setInterval(() => {
      void fetchContractInfo();
    }, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [campaignId]);

  const handleTriggerPayout = async () => {
    if (!campaignId) {
      return;
    }

    if (!walletConnected || !walletAddress) {
      setPayoutError("Connect your founder Freighter wallet to end campaign on-chain");
      return;
    }

    setTriggeringPayout(true);
    setPayoutStreaming(true);
    setPayoutError(null);

    try {
      const endTxResponse = await fetch(`${apiBaseUrl}/api/campaigns/${campaignId}/end-campaign-tx`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          founderPublicKey: walletAddress
        })
      });

      const endTxPayload = (await endTxResponse.json()) as ApiResponse<{
        xdr?: string;
        networkPassphrase: string;
        alreadyEnded?: boolean;
      }>;

      if (!endTxResponse.ok || !endTxPayload.success || !endTxPayload.data) {
        setPayoutError(endTxPayload.error ?? "Failed to prepare end-campaign transaction");
        setPayoutStreaming(false);
        return;
      }

      const streamUrl = new URL(`${apiBaseUrl}/api/campaigns/${campaignId}/payout`);
      if (!endTxPayload.data.alreadyEnded) {
        if (!endTxPayload.data.xdr) {
          setPayoutError("Missing end-campaign transaction payload");
          setPayoutStreaming(false);
          return;
        }

        const freighterSign = await getFreighterSign();
        if (!freighterSign) {
          setPayoutError("Freighter extension not available");
          setPayoutStreaming(false);
          return;
        }

        const signResult = await freighterSign(endTxPayload.data.xdr, {
          networkPassphrase: endTxPayload.data.networkPassphrase
        });
        if (signResult.error) {
          setPayoutError(`Freighter signing failed: ${signResult.error}`);
          setPayoutStreaming(false);
          return;
        }

        const sdk = await import("@stellar/stellar-sdk");
        const horizon = new sdk.Horizon.Server(HORIZON_URL);
        const signedTx = sdk.TransactionBuilder.fromXDR(
          signResult.signedTxXdr,
          endTxPayload.data.networkPassphrase ?? NETWORK_PASSPHRASE
        );
        const submission = await horizon.submitTransaction(signedTx);
        streamUrl.searchParams.set("endTxHash", submission.hash);
      }

      const eventSource = new EventSource(streamUrl.toString(), { withCredentials: true });
      let streamCompleted = false;

      eventSource.addEventListener("payout", (event) => {
        const data = JSON.parse(event.data) as {
          payoutId: string;
          creatorId: string;
          creatorName: string;
          amountXLM: number;
          status: PayoutStatus;
          txHash: string | null;
          txUrl: string | null;
        };

        setPayouts((previous) => {
          const nextEntry: CampaignPayoutEntry = {
            id: data.payoutId,
            campaignId,
            userId: data.creatorId,
            userName: data.creatorName,
            amount: data.amountXLM,
            status: data.status,
            stellarTxHash: data.txHash,
            stellarTxUrl: data.txUrl,
            createdAt: new Date().toISOString()
          };

          return [nextEntry, ...previous.filter((entry) => entry.id !== data.payoutId)].slice(0, 60);
        });
      });

      eventSource.addEventListener("campaign-ended", () => {
        setCampaign((previous) => {
          if (!previous) {
            return previous;
          }

          return {
            ...previous,
            status: "ENDED"
          };
        });
      });

      eventSource.addEventListener("refund", (event) => {
        try {
          const data = JSON.parse((event as MessageEvent).data) as {
            destination: string | null;
            amountXLM: number;
            status: "COMPLETED" | "FAILED" | "SKIPPED";
            txUrl: string | null;
          };
          pushToast({
            type: data.status === "COMPLETED" ? "success" : "warning",
            title: "Pool settlement",
            message:
              data.status === "COMPLETED"
                ? `Refunded ${data.amountXLM.toFixed(2)} XLM to founder wallet.`
                : "Pool refund could not be completed automatically."
          });
        } catch {
          // ignore malformed stream events
        }
      });

      eventSource.addEventListener("done", (event) => {
        const payload = JSON.parse((event as MessageEvent).data) as { balanceXLM?: number };
        setCampaign((previous) => {
          if (!previous) {
            return previous;
          }

          const balance = Number(payload.balanceXLM ?? 0);
          return {
            ...previous,
            status: "ENDED",
            remainingBudget: balance,
            stats: {
              ...previous.stats,
              remainingBudget: balance
            }
          };
        });
        streamCompleted = true;
        setPayoutStreaming(false);
        eventSource.close();
      });

      eventSource.addEventListener("payout-error", (event) => {
        streamCompleted = true;
        setPayoutStreaming(false);
        try {
          const payload = JSON.parse((event as MessageEvent).data) as { message?: string };
          setPayoutError(payload.message ?? "Failed to execute payout stream");
        } catch {
          setPayoutError("Failed to execute payout stream");
        }
        eventSource.close();
      });

      eventSource.addEventListener("error", () => {
        if (streamCompleted) {
          return;
        }

        setPayoutStreaming(false);
        setPayoutError("Payout stream disconnected before completion");
        eventSource.close();
      });

      pushToast({
        type: "info",
        title: "Payout started",
        message: "Live transaction cards will appear as distributions are processed."
      });
    } catch {
      setPayoutError("Failed to trigger payout");
      setPayoutStreaming(false);
    } finally {
      setTriggeringPayout(false);
      setShowPayoutConfirm(false);
    }
  };

  const handleSubmitPost = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const submitPost = async () => {
      if (!campaignId) {
        return;
      }

      setSubmissionPhase("submitting");
      setSubmissionMessage(null);
      setRejectionReason(null);
      setSubmittedPostId(null);

      try {
        const response = await fetch(`${apiBaseUrl}/api/posts`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            campaignId,
            postUrl,
            platform
          })
        });

        const payload = (await response.json()) as ApiResponse<PostSubmissionResponse>;

        if (!response.ok || !payload.success || !payload.data?.postId) {
          setSubmissionPhase("error");
          setSubmissionMessage(payload.error ?? "Failed to submit post");
          return;
        }

        setSubmittedPostId(payload.data.postId);
        setSubmissionPhase("pending");
        setSubmissionMessage("Verifying your post...");

        pushToast({
          type: "info",
          title: "Post submitted",
          message: "Verification has started."
        });
      } catch {
        setSubmissionPhase("error");
        setSubmissionMessage("Failed to submit post");
      }
    };

    void submitPost();
  };

  useEffect(() => {
    if (!submittedPostId || submissionPhase !== "pending") {
      return;
    }

    let isCancelled = false;
    let attempts = 0;
    const maxAttempts = 40;

    const pollStatus = async () => {
      if (isCancelled) {
        return;
      }

      attempts += 1;

      try {
        const response = await fetch(`${apiBaseUrl}/api/posts/${submittedPostId}/status`, {
          method: "GET",
          credentials: "include"
        });

        const payload = (await response.json()) as ApiResponse<PostStatusResponse>;

        if (!response.ok || !payload.success || !payload.data) {
          if (!isCancelled) {
            setSubmissionPhase("error");
            setSubmissionMessage(payload.error ?? "Unable to check verification status");
          }
          return;
        }

        if (payload.data.status === "VERIFIED") {
          if (!isCancelled) {
            setSubmissionPhase("verified");
            setSubmissionMessage("Post verified! You're on the leaderboard.");
            setPostUrl("");
            pushToast({
              type: "success",
              title: "Post verified",
              message: "Your content is now counted in rankings."
            });
          }
          return;
        }

        if (payload.data.status === "REJECTED") {
          if (!isCancelled) {
            setSubmissionPhase("rejected");
            setRejectionReason(payload.data.rejectionReason ?? "Post verification failed");
            pushToast({
              type: "warning",
              title: "Post rejected",
              message: payload.data.rejectionReason ?? "Please review campaign requirements and retry."
            });
          }
          return;
        }

        if (attempts < maxAttempts) {
          setTimeout(() => {
            void pollStatus();
          }, 2500);
          return;
        }

        if (!isCancelled) {
          setSubmissionPhase("error");
          setSubmissionMessage("Verification timed out. Please try polling again.");
        }
      } catch {
        if (!isCancelled) {
          setSubmissionPhase("error");
          setSubmissionMessage("Unable to check verification status");
        }
      }
    };

    void pollStatus();

    return () => {
      isCancelled = true;
    };
  }, [submissionPhase, submittedPostId, pushToast]);

  if (loadingCampaign) {
    return (
      <main className="min-h-screen px-4 py-6 sm:px-6 md:py-8 lg:px-10">
        <section className="mx-auto w-full max-w-6xl space-y-4">
          <Skeleton className="h-44 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-52 w-full rounded-lg" />
        </section>
      </main>
    );
  }

  if (error || !campaign) {
    if (campaignMissing || !campaign) {
      return <CampaignNotFoundFallback message={error ?? "Campaign not found"} />;
    }

    return <CampaignNotFoundFallback message={error ?? "Unable to load campaign"} />;
  }

  return (
    <ErrorBoundary fallback={<CampaignNotFoundFallback />} resetKey={campaignId}>
      <main className="min-h-screen bg-[var(--color-background)] text-[#e2e8f0] pb-20">
        <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
          
          {/* Hero Section */}
          <header className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/70 backdrop-blur-xl p-8 shadow-2xl">
            <div className="absolute top-0 left-0 h-1 w-full bg-[var(--color-secondary)]"></div>
            
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 relative z-10">
              <div className="space-y-4 max-w-3xl">
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-3xl font-bold text-white sm:text-4xl">{campaign.title}</h1>
                  <StatusBadge status={campaign.status} />
                </div>
                
                <p className="text-lg leading-relaxed text-[var(--color-muted)]">{campaign.description}</p>
                
                <div className="flex items-center gap-3 pt-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-primary)] text-white font-bold">
                    F
                  </div>
                  <div>
                    <p className="text-xs text-[var(--color-muted)]">Campaign Founder</p>
                    <p className="text-sm font-semibold text-white truncate max-w-[200px]">{truncateAddress(campaign.founderId)}</p>
                  </div>
                </div>
              </div>

              <div className="flex-shrink-0 min-w-[240px] p-6 rounded-xl bg-[#0D0F14] border border-[var(--color-border)]">
                <p className="text-xs uppercase tracking-wider text-[var(--color-muted)] mb-1">Contract Address</p>
                {campaign.contractId ? (
                  <a
                    href={`https://stellar.expert/explorer/testnet/search?term=${encodeURIComponent(campaign.contractId)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-medium text-[var(--color-primary)] hover:underline break-all"
                  >
                    {truncateAddress(campaign.contractId)} ↗
                  </a>
                ) : (
                  <span className="text-sm text-[var(--color-muted)]">Pending deployment...</span>
                )}
              </div>
            </div>

            <div className="mt-10 pt-8 border-t border-[var(--color-border)]/50">
              <BudgetBar totalBudget={campaign.totalBudget} remainingBudget={campaign.remainingBudget} />
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-8">
                <div className="flex flex-col">
                  <span className="text-sm text-[var(--color-muted)]">Total Budget</span>
                  <span className="text-xl font-semibold text-white">{campaign.totalBudget.toLocaleString()} XLM</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-sm text-[var(--color-muted)]">Participants</span>
                  <span className="text-xl font-semibold text-white">{campaign.stats.postCount}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-sm text-[var(--color-muted)]">Top Scorer</span>
                  <span className="text-xl font-semibold text-white truncate">{topScorerText}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-sm text-[var(--color-muted)]">Estimated Earnings</span>
                  <span className="text-xl font-semibold text-[var(--color-secondary)]">Dynamic</span>
                </div>
              </div>
            </div>
          </header>

          {isFounderView ? (
            <section className="grid gap-3 md:grid-cols-3">
              {flowSteps.map((step) => (
                <article
                  key={step.title}
                  className={`rounded-xl border p-4 ${
                    step.done
                      ? "border-[var(--color-success)]/40 bg-[var(--color-success)]/10"
                      : "border-[var(--color-border)] bg-[var(--color-surface)]/35"
                  }`}
                >
                  <p className="text-sm font-semibold text-white">{step.title}</p>
                  <p className="mt-1 text-xs text-[var(--color-muted)]">{step.detail}</p>
                </article>
              ))}
            </section>
          ) : null}

          {isFounderView ? (
            <section className="rounded-2xl border border-[var(--color-primary)]/30 bg-[#0D0F14] p-6 md:p-8 shadow-lg">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    {campaign.contractId ? "Founder Payout Console" : "Campaign Deployment Console"}
                  </h2>
                  <p className="text-sm text-[var(--color-muted)] mt-1">
                    {campaign.contractId 
                      ? "Distribute campaign budget on Stellar testnet and monitor transaction flow."
                      : "Your campaign is currently a draft. Deploy the Soroban contract and fund it to go live."}
                  </p>
                  <p className="mt-2 text-xs font-medium text-[var(--color-secondary)]">
                    Fee buffer reserved: {FOUNDER_FEE_BUFFER_XLM} XLM (not part of distributable campaign budget)
                  </p>
                </div>
                {campaign.status === "ACTIVE" && campaign.contractId ? (
                  <button
                    type="button"
                    onClick={() => setShowPayoutConfirm(true)}
                    disabled={triggeringPayout || payoutStreaming}
                    className="rounded-full bg-[var(--color-primary)] px-6 py-2.5 text-sm font-semibold text-white shadow-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
                  >
                    {triggeringPayout || payoutStreaming ? "Processing..." : "End Campaign & Distribute"}
                  </button>
                ) : null}
              </div>
              {payoutError ? <p className="mb-6 text-sm text-[var(--color-danger)]">{payoutError}</p> : null}

              {showPayoutConfirm ? (
                <div className="rounded-xl border border-[var(--color-primary)]/50 bg-[var(--color-surface)] p-6 mb-8">
                  <p className="text-sm text-white mb-4">
                    This will end the campaign now (even before the scheduled end date) and distribute <span className="font-bold text-[var(--color-secondary)]">{campaign.remainingBudget.toFixed(2)} XLM</span> to participants with connected wallets.
                  </p>
                  <div className="flex gap-4">
                    <button
                      type="button"
                      onClick={handleTriggerPayout}
                      disabled={triggeringPayout}
                      className="rounded-full bg-[var(--color-primary)] px-6 py-2 text-sm font-semibold text-white hover:bg-opacity-90 transition-all"
                    >
                      Confirm End & Distribute
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowPayoutConfirm(false)}
                      className="rounded-full border border-[var(--color-border)] px-6 py-2 text-sm font-semibold text-white hover:bg-[var(--color-surface)]/80 transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}

              {campaign.contractId ? (
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-muted)] mb-4">Live Transaction Feed</h3>
                  {payoutLoading ? (
                    <div className="space-y-3">
                      <Skeleton className="h-16 w-full rounded-xl bg-[var(--color-surface)]" />
                      <Skeleton className="h-16 w-full rounded-xl bg-[var(--color-surface)]" />
                    </div>
                  ) : payouts.length === 0 ? (
                    <EmptyState
                      variant="payouts"
                      title="No payouts yet"
                      description="Transactions will appear here once distribution begins."
                    />
                  ) : (
                    <ul className="space-y-3">
                      {payouts.map((payout) => (
                        <li
                          key={payout.id}
                          className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/50 p-4"
                        >
                          <div>
                            <p className="font-semibold text-white">{payout.userName}</p>
                            <p className="text-sm text-[var(--color-secondary)] font-mono">{payout.amount.toFixed(2)} XLM</p>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="rounded-full bg-[var(--color-background)] px-3 py-1 text-xs font-semibold uppercase tracking-wider" style={getPayoutStatusStyle(payout.status)}>
                              {payout.status}
                            </span>
                            {payout.stellarTxUrl ? (
                              <a
                                href={payout.stellarTxUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs font-medium text-[var(--color-primary)] hover:underline"
                              >
                                View Tx ↗
                              </a>
                            ) : (
                              <span className="text-xs text-[var(--color-muted)]">Pending...</span>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <div className="rounded-2xl border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/5 p-8">
                  <FundCampaignStep 
                    campaign={{
                      id: campaign.id,
                      title: campaign.title,
                      budget: campaign.budget ?? "0",
                      budgetToken: campaign.budgetToken ?? "XLM",
                      founderWalletAddress: campaign.founderId
                    }} 
                    onSuccess={() => {
                      // Reload campaign data to show active state
                      window.location.reload();
                    }}
                    onSkip={() => {}}
                  />
                </div>
              )}
            </section>
          ) : null}

          <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/30 backdrop-blur p-6">
            <ErrorBoundary fallback={<LeaderboardFallback />} resetKey={`${campaignId}-leaderboard`}>
              <Leaderboard
                campaignId={campaignId}
                initialEntries={leaderboard}
                isLoading={loadingLeaderboard}
              />
            </ErrorBoundary>
          </section>

          {canSubmitPost ? (
            <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/30 backdrop-blur p-6 md:p-8">
              <div className="grid gap-8 lg:grid-cols-[1fr_1.5fr]">
                <div>
                  <h2 className="text-xl font-bold text-white mb-3">Submit your post</h2>
                  <p className="text-sm text-[var(--color-muted)] mb-4">
                    Share your live post URL and we will verify it automatically for scoring.
                  </p>
                  <div className="space-y-2">
                    <div className="rounded-lg border border-[var(--color-border)] bg-[#0D0F14] px-3 py-2 text-xs text-[var(--color-muted)]">
                      1. Publish post with campaign keywords
                    </div>
                    <div className="rounded-lg border border-[var(--color-border)] bg-[#0D0F14] px-3 py-2 text-xs text-[var(--color-muted)]">
                      2. Paste the direct URL below
                    </div>
                    <div className="rounded-lg border border-[var(--color-border)] bg-[#0D0F14] px-3 py-2 text-xs text-[var(--color-muted)]">
                      3. Track verification status instantly
                    </div>
                  </div>
                </div>

                <ErrorBoundary fallback={<PostSubmissionFallback />} resetKey={`${campaignId}-submit`}>
                  <form className="space-y-5" onSubmit={handleSubmitPost}>
                    <div>
                      <label htmlFor="post-url" className="block text-sm font-medium text-[var(--color-muted)] mb-2">Post URL</label>
                      <input
                        id="post-url"
                        type="url"
                        value={postUrl}
                        onChange={(event) => setPostUrl(event.target.value)}
                        required
                        placeholder="https://x.com/username/status/..."
                        className="w-full rounded-xl border border-[var(--color-border)] bg-[#0D0F14] px-4 py-3 text-white focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] transition-all"
                      />
                    </div>

                    <div>
                      <label htmlFor="platform" className="block text-sm font-medium text-[var(--color-muted)] mb-2">Platform</label>
                      <select
                        id="platform"
                        value={platform}
                        onChange={(event) => setPlatform(event.target.value as SocialPlatform)}
                        className="w-full rounded-xl border border-[var(--color-border)] bg-[#0D0F14] px-4 py-3 text-white focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] transition-all appearance-none"
                      >
                        <option value="TWITTER">X (Twitter)</option>
                        <option value="LINKEDIN">LinkedIn</option>
                        <option value="INSTAGRAM">Instagram</option>
                      </select>
                    </div>

                    <button
                      type="submit"
                      disabled={submissionPhase === "submitting" || submissionPhase === "pending"}
                      className="w-full rounded-full bg-[var(--color-secondary)] px-6 py-4 text-sm font-bold text-white shadow-lg hover:opacity-90 disabled:opacity-50 transition-all"
                    >
                      {submissionPhase === "submitting" || submissionPhase === "pending" ? "Verifying..." : "Submit Post"}
                    </button>
                  </form>
                </ErrorBoundary>
              </div>

              {submissionPhase === "pending" && (
                <div className="mt-6 flex items-center justify-center gap-3 p-4 rounded-xl bg-[var(--color-primary)]/10 text-[var(--color-primary)] text-sm">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"></div>
                  Verifying engagement and authenticity...
                </div>
              )}
              
              {submissionPhase === "verified" && (
                <div className="mt-6 p-4 rounded-xl bg-[var(--color-success)]/10 text-[var(--color-success)] text-sm font-medium text-center border border-[var(--color-success)]/20">
                  Post verified successfully! You've been added to the leaderboard.
                </div>
              )}

              {submissionPhase === "rejected" && (
                <div className="mt-6 p-4 rounded-xl bg-[var(--color-danger)]/10 text-[var(--color-danger)] text-sm text-center border border-[var(--color-danger)]/20">
                  <span className="font-bold block mb-1">Verification Failed</span>
                  {rejectionReason ?? "Your post didn't meet campaign requirements."}
                </div>
              )}

              {submissionPhase === "error" && submissionMessage && (
                <div className="mt-6 p-4 rounded-xl bg-[var(--color-danger)]/10 text-[var(--color-danger)] text-sm text-center border border-[var(--color-danger)]/20">
                  {submissionMessage}
                </div>
              )}
            </section>
          ) : null}

          {!isFounderView && isCampaignEnded ? (
            <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/20 p-5 text-center">
              <p className="text-sm text-[var(--color-muted)]">
                This campaign has ended. Post submissions are now closed.
              </p>
            </section>
          ) : null}

        </section>
      </main>
    </ErrorBoundary>
  );
}

export default withAuth(CampaignDetailsPage);
