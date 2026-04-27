"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { ApiResponse, CampaignStatus } from "@earnify/shared";

import { Badge, resolveBadges } from "../../../components/Badge";
import { CampaignCard } from "../../../components/CampaignCard";
import { EmptyState } from "../../../components/EmptyState";
import { Skeleton } from "../../../components/Skeleton";
import { useAuth } from "../../../components/auth/AuthProvider";
import { withAuth } from "../../../components/auth/withAuth";
import { useToast } from "../../../components/toast/ToastProvider";
import { ConnectWalletButton } from "../../../components/wallet/ConnectWalletButton";
import { useWallet } from "../../../components/wallet/WalletProvider";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

type MyEarningsCampaign = {
  campaignId: string;
  campaignTitle: string;
  posts: number;
  currentScore: number;
  totalCampaignScore: number;
  campaignBudget: number;
  estimatedPayout: number;
  lastUpdatedAt: string;
};

type UserPayoutStatus = "PENDING" | "COMPLETED" | "FAILED";

type UserPayoutEntry = {
  id: string;
  campaignId: string;
  campaignTitle: string;
  amount: number;
  status: UserPayoutStatus;
  stellarTxHash: string | null;
  stellarTxUrl: string | null;
  createdAt: string;
};

type UserPayoutHistory = {
  userId: string;
  walletAddress: string | null;
  payouts: UserPayoutEntry[];
};

type DashboardCampaign = {
  id: string;
  title: string;
  description: string;
  totalBudget: number;
  remainingBudget: number;
  status: CampaignStatus;
  postCount: number;
  platforms: string[];
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  founder?: {
    id: string;
    name: string;
    avatar?: string | null;
  };
};

type CampaignSegment = "live" | "upcoming" | "ended";

function hashUserId(userId: string) {
  let hash = 0;

  for (const char of userId) {
    hash = (hash * 31 + char.charCodeAt(0)) % 997;
  }

  return hash;
}

function classifyCampaignSegment(campaign: DashboardCampaign): CampaignSegment {
  const now = Date.now();
  const endTime = campaign.endDate ? new Date(campaign.endDate).getTime() : Number.POSITIVE_INFINITY;
  const startTime = campaign.startDate ? new Date(campaign.startDate).getTime() : Number.NEGATIVE_INFINITY;

  const endedByDate = Number.isFinite(endTime) && endTime <= now;

  if (campaign.status === "ENDED" || campaign.status === "COMPLETED" || endedByDate) {
    return "ended";
  }

  if (campaign.status === "ACTIVE" && startTime <= now) {
    return "live";
  }

  return "upcoming";
}

function DashboardPage() {
  const { user, switchRole } = useAuth();
  const { pushToast } = useToast();
  const { walletAddress: freighterAddress } = useWallet();

  const [campaigns, setCampaigns] = useState<DashboardCampaign[]>([]);
  const [earnings, setEarnings] = useState<MyEarningsCampaign[]>([]);
  const [payoutHistory, setPayoutHistory] = useState<UserPayoutHistory | null>(null);

  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [loadingEarnings, setLoadingEarnings] = useState(true);
  const [loadingPayoutHistory, setLoadingPayoutHistory] = useState(true);

  const [claimingPayoutId, setClaimingPayoutId] = useState<string | null>(null);
  const [switchingRole, setSwitchingRole] = useState(false);

  const [campaignError, setCampaignError] = useState<string | null>(null);
  const [earningsError, setEarningsError] = useState<string | null>(null);
  const [payoutError, setPayoutError] = useState<string | null>(null);
  const [campaignTab, setCampaignTab] = useState<CampaignSegment>("live");

  const seenCompletedPayoutsRef = useRef<Set<string>>(new Set());

  const effectiveWalletAddress = freighterAddress ?? payoutHistory?.walletAddress ?? null;

  useEffect(() => {
    const fetchCampaigns = async () => {
      setLoadingCampaigns(true);
      setCampaignError(null);

      try {
        const response = await fetch(`${apiBaseUrl}/api/campaigns`, {
          method: "GET",
          credentials: "include"
        });

        const payload = (await response.json()) as ApiResponse<DashboardCampaign[]>;

        if (!response.ok || !payload.success || !payload.data) {
          setCampaignError(payload.error ?? "Failed to load campaigns");
          return;
        }

        setCampaigns(payload.data);
      } catch {
        setCampaignError("Failed to load campaigns");
      } finally {
        setLoadingCampaigns(false);
      }
    };

    void fetchCampaigns();
  }, []);

  useEffect(() => {
    if (user?.role !== "USER") {
      setEarnings([]);
      setLoadingEarnings(false);
      setEarningsError(null);
      return;
    }

    const fetchEarnings = async () => {
      setLoadingEarnings(true);

      try {
        const response = await fetch(`${apiBaseUrl}/api/dashboard/earnings`, {
          method: "GET",
          credentials: "include"
        });

        const payload = (await response.json()) as ApiResponse<MyEarningsCampaign[]>;

        if (!response.ok || !payload.success || !payload.data) {
          setEarningsError(payload.error ?? "Failed to load earnings");
          return;
        }

        setEarnings(payload.data);
      } catch {
        setEarningsError("Failed to load earnings");
      } finally {
        setLoadingEarnings(false);
      }
    };

    void fetchEarnings();
  }, [user?.role]);

  useEffect(() => {
    if (user?.role !== "USER" || !user.id) {
      setPayoutHistory(null);
      setLoadingPayoutHistory(false);
      setPayoutError(null);
      return;
    }

    const fetchPayoutHistory = async () => {
      setLoadingPayoutHistory(true);
      setPayoutError(null);

      try {
        const response = await fetch(`${apiBaseUrl}/api/users/${user.id}/payouts`, {
          method: "GET",
          credentials: "include"
        });

        const payload = (await response.json()) as ApiResponse<UserPayoutHistory>;

        if (!response.ok || !payload.success || !payload.data) {
          setPayoutError(payload.error ?? "Failed to load payout history");
          return;
        }

        setPayoutHistory(payload.data);
      } catch {
        setPayoutError("Failed to load payout history");
      } finally {
        setLoadingPayoutHistory(false);
      }
    };

    void fetchPayoutHistory();
  }, [user?.id, user?.role]);

  useEffect(() => {
    if (!payoutHistory) {
      return;
    }

    for (const payout of payoutHistory.payouts) {
      if (payout.status === "COMPLETED" && !seenCompletedPayoutsRef.current.has(payout.id)) {
        seenCompletedPayoutsRef.current.add(payout.id);
      }
    }
  }, [payoutHistory]);

  const claimPayout = async (campaignId: string, payoutId: string) => {
    if (!user?.id) {
      return;
    }

    setClaimingPayoutId(payoutId);
    setPayoutError(null);

    try {
      const response = await fetch(`${apiBaseUrl}/api/users/${user.id}/payouts/${campaignId}/claim`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(effectiveWalletAddress ? { walletAddress: effectiveWalletAddress } : {})
      });

      const payload = (await response.json()) as ApiResponse<{
        id: string;
        status: UserPayoutStatus;
        stellarTxHash?: string | null;
        stellarTxUrl?: string | null;
      }>;

      if (!response.ok || !payload.success || !payload.data) {
        setPayoutError(payload.error ?? "Failed to claim payout");
        return;
      }

      const claimed = payload.data;

      setPayoutHistory((previous) => {
        if (!previous) {
          return previous;
        }

        return {
          ...previous,
          payouts: previous.payouts.map((payout) =>
            payout.id === claimed.id
              ? {
                  ...payout,
                  status: claimed.status,
                  stellarTxHash: claimed.stellarTxHash ?? null,
                  stellarTxUrl: claimed.stellarTxUrl ?? null
                }
              : payout
          )
        };
      });

      if (claimed.status === "COMPLETED") {
        seenCompletedPayoutsRef.current.add(claimed.id);
        pushToast({
          type: "success",
          title: "Payout received",
          message: "Your XLM transfer was confirmed on Stellar testnet."
        });
      } else {
        pushToast({
          type: "warning",
          title: "Payout pending review",
          message: "The payout was attempted but did not complete."
        });
      }
    } catch {
      setPayoutError("Failed to claim payout");
    } finally {
      setClaimingPayoutId(null);
    }
  };

  const currencyFormatter = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  const formatXlm = (value: number) => currencyFormatter.format(value);

  const profileBadges = useMemo(() => {
    const campaignCount = earnings.filter((entry) => entry.posts > 0).length;
    const maxPostScore = earnings.reduce((max, entry) => Math.max(max, entry.currentScore), 0);
    const pseudoEarlyRank = user?.id ? (hashUserId(user.id) % 250) + 1 : undefined;

    return resolveBadges({
      campaignCount,
      maxPostScore,
      verifiedPostCount: earnings.reduce((sum, entry) => sum + entry.posts, 0),
      earlyAdopterRank: pseudoEarlyRank
    });
  }, [earnings, user?.id]);

  const segmentedCampaigns = useMemo(() => {
    const live: DashboardCampaign[] = [];
    const upcoming: DashboardCampaign[] = [];
    const ended: DashboardCampaign[] = [];

    for (const campaign of campaigns) {
      const segment = classifyCampaignSegment(campaign);
      if (segment === "live") live.push(campaign);
      if (segment === "upcoming") upcoming.push(campaign);
      if (segment === "ended") ended.push(campaign);
    }

    return { live, upcoming, ended };
  }, [campaigns]);

  const campaignItems = segmentedCampaigns[campaignTab];

  const handleSwitchRole = async (nextRole: "FOUNDER" | "USER") => {
    setSwitchingRole(true);
    const ok = await switchRole(nextRole);

    if (!ok) {
      pushToast({
        type: "warning",
        title: "Role update failed",
        message: "Please try again."
      });
    } else {
      pushToast({
        type: "success",
        title: "Role updated",
        message: nextRole === "FOUNDER" ? "Founder mode enabled." : "User mode enabled."
      });
      window.location.href = "/dashboard";
    }

    setSwitchingRole(false);
  };

  return (
    <main className="min-h-screen pb-16">
      <section className="mx-auto w-full max-w-7xl space-y-7 px-4 py-8 sm:px-6 lg:px-8">
        <header className="surface-card rounded-sm p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-primary)]">Creator Dashboard</p>
          <h1 className="mt-3 text-3xl font-semibold text-zinc-100">Campaign performance and payouts</h1>
          <p className="mt-3 max-w-3xl text-sm text-zinc-400">
            Campaigns are separated by live, upcoming, and ended states to keep your workflow focused.
          </p>
          <div className="mt-6">
            <button
              type="button"
              disabled={switchingRole}
              onClick={() => {
                void handleSwitchRole("FOUNDER");
              }}
              className="inline-flex items-center border border-[var(--color-primary)] px-4 py-2 text-xs font-bold uppercase tracking-[0.08em] text-[var(--color-primary)] hover:bg-[var(--color-primary)]/12 disabled:opacity-60"
            >
              {switchingRole ? "Switching..." : "Switch to Founder"}
            </button>
          </div>
        </header>

        <div className="grid gap-7 lg:grid-cols-[1fr_370px]">
          <section className="space-y-5">
            <div className="surface-card rounded-sm p-5">
              <div className="flex flex-wrap items-center gap-2">
                {(["live", "upcoming", "ended"] as CampaignSegment[]).map((segment) => (
                  <button
                    key={segment}
                    type="button"
                    onClick={() => setCampaignTab(segment)}
                    className={`border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.09em] ${
                      campaignTab === segment
                        ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-black"
                        : "border-zinc-700 text-zinc-300"
                    }`}
                  >
                    {segment} ({segmentedCampaigns[segment].length})
                  </button>
                ))}
              </div>
            </div>

            {loadingCampaigns ? (
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={`dashboard-campaign-skeleton-${index}`} className="surface-card rounded-sm p-6">
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="mt-3 h-6 w-3/4" />
                    <Skeleton className="mt-4 h-4 w-full" />
                    <Skeleton className="mt-7 h-10 w-full" />
                  </div>
                ))}
              </div>
            ) : null}

            {campaignError ? <p className="text-sm text-[var(--color-danger)]">{campaignError}</p> : null}

            {!loadingCampaigns && !campaignError && campaignItems.length > 0 ? (
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                {campaignItems.map((campaign) => (
                  <CampaignCard
                    key={campaign.id}
                    campaign={{
                      id: campaign.id,
                      title: campaign.title,
                      description: campaign.description,
                      founder: campaign.founder,
                      platforms: campaign.platforms,
                      budgetTotal: campaign.totalBudget,
                      budgetRemaining: campaign.remainingBudget,
                      participants: campaign.postCount,
                      status: campaign.status,
                      endDate: campaign.endDate,
                      startDate: campaign.startDate,
                      createdAt: campaign.createdAt
                    }}
                  />
                ))}
              </div>
            ) : null}

            {!loadingCampaigns && !campaignError && campaignItems.length === 0 ? (
              <EmptyState
                variant="campaigns"
                title={`No ${campaignTab} campaigns`}
                description="Campaigns will appear here automatically based on real-time status."
              />
            ) : null}
          </section>

          <aside className="space-y-5">
            <section className="surface-card rounded-sm p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-zinc-300">Estimated Earnings</h2>
                <span className="text-xs text-zinc-500">Live</span>
              </div>

              <p className="text-3xl font-semibold text-[var(--color-primary)]">
                {formatXlm(earnings.reduce((sum, entry) => sum + entry.estimatedPayout, 0))} XLM
              </p>

              {loadingEarnings ? (
                <div className="mt-4 space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : earningsError ? (
                <p className="mt-4 text-sm text-[var(--color-danger)]">{earningsError}</p>
              ) : earnings.length === 0 ? (
                <p className="mt-4 text-sm text-zinc-500">No verified earnings yet.</p>
              ) : (
                <div className="mt-4 space-y-2">
                  {earnings.slice(0, 5).map((entry) => (
                    <div key={entry.campaignId} className="border border-zinc-800 bg-black/25 p-3">
                      <p className="truncate text-sm font-medium text-zinc-100">{entry.campaignTitle}</p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {entry.posts} posts • {entry.currentScore.toFixed(1)} score
                      </p>
                      <p className="mt-1 text-sm font-semibold text-[var(--color-primary)]">+{formatXlm(entry.estimatedPayout)} XLM</p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="surface-card rounded-sm p-5">
              <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-zinc-300">Profile Badges</h3>
              {profileBadges.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {profileBadges.map((badge) => (
                    <Badge key={`profile-${badge}`} badge={badge} />
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-zinc-500">Complete campaigns to unlock badges.</p>
              )}
            </section>

            <section className="surface-card rounded-sm p-5">
              <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-zinc-300">Payouts</h3>

              <div className="mt-4 border border-zinc-800 bg-black/40 p-4">
                {!effectiveWalletAddress ? (
                  <div className="space-y-3 text-center">
                    <p className="text-xs text-zinc-500">Connect wallet to receive payouts</p>
                    <ConnectWalletButton />
                  </div>
                ) : (
                  <div className="space-y-3 text-center">
                    <p className="text-xs text-zinc-500">Connected Wallet</p>
                    <p className="text-xs font-mono text-[var(--color-primary)]">
                      {effectiveWalletAddress.slice(0, 6)}...{effectiveWalletAddress.slice(-6)}
                    </p>
                    <ConnectWalletButton />
                  </div>
                )}
              </div>

              {loadingPayoutHistory ? (
                <div className="mt-4 space-y-2">
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-14 w-full" />
                </div>
              ) : payoutError ? (
                <p className="mt-4 text-sm text-[var(--color-danger)]">{payoutError}</p>
              ) : !payoutHistory || payoutHistory.payouts.length === 0 ? (
                <p className="mt-4 text-sm text-zinc-500">No payouts yet.</p>
              ) : (
                <div className="mt-4 space-y-2">
                  {payoutHistory.payouts.slice(0, 6).map((payout) => (
                    <div key={payout.id} className="border border-zinc-800 bg-black/35 p-3">
                      <p className="truncate text-xs font-semibold uppercase tracking-[0.08em] text-zinc-300">{payout.campaignTitle}</p>
                      <p className="mt-1 text-sm font-semibold text-zinc-100">{formatXlm(payout.amount)} XLM</p>

                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span
                          className={`border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] ${
                            payout.status === "COMPLETED"
                              ? "border-zinc-500 text-zinc-100"
                              : payout.status === "FAILED"
                                ? "border-red-400/45 text-red-300"
                                : "border-[var(--color-primary)]/50 text-[var(--color-primary)]"
                          }`}
                        >
                          {payout.status}
                        </span>

                        <div className="flex items-center gap-2">
                          {(payout.status === "PENDING" || payout.status === "FAILED") && (
                            <button
                              type="button"
                              onClick={() => claimPayout(payout.campaignId, payout.id)}
                              disabled={claimingPayoutId === payout.id || !effectiveWalletAddress}
                              className="border border-[var(--color-primary)] bg-[var(--color-primary)] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-black disabled:opacity-50"
                            >
                              {claimingPayoutId === payout.id ? "..." : payout.status === "FAILED" ? "Retry" : "Claim"}
                            </button>
                          )}

                          {payout.stellarTxUrl ? (
                            <a
                              href={payout.stellarTxUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-primary)]"
                            >
                              Tx
                            </a>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}

export default withAuth(DashboardPage, { role: "USER" });
