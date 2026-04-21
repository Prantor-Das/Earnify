"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { ApiResponse, CampaignStatus } from "@earnify/shared";

import { Badge, resolveBadges } from "../../components/Badge";
import { CampaignCard } from "../../components/CampaignCard";
import { EmptyState } from "../../components/EmptyState";
import { Skeleton } from "../../components/Skeleton";
import { useAuth } from "../../components/auth/AuthProvider";
import { withAuth } from "../../components/auth/withAuth";
import { useToast } from "../../components/toast/ToastProvider";

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

type UserPayoutEntry = {
  id: string;
  campaignId: string;
  campaignTitle: string;
  amount: number;
  status: "PENDING" | "COMPLETED" | "FAILED";
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
};

function hashUserId(userId: string) {
  let hash = 0;

  for (const char of userId) {
    hash = (hash * 31 + char.charCodeAt(0)) % 997;
  }

  return hash;
}

function DashboardPage() {
  const { user } = useAuth();
  const { pushToast } = useToast();

  const [campaigns, setCampaigns] = useState<DashboardCampaign[]>([]);
  const [earnings, setEarnings] = useState<MyEarningsCampaign[]>([]);
  const [payoutHistory, setPayoutHistory] = useState<UserPayoutHistory | null>(null);

  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [loadingEarnings, setLoadingEarnings] = useState(true);
  const [loadingPayoutHistory, setLoadingPayoutHistory] = useState(true);

  const [walletInput, setWalletInput] = useState("");
  const [walletSaving, setWalletSaving] = useState(false);
  const [claimingPayoutId, setClaimingPayoutId] = useState<string | null>(null);

  const [campaignError, setCampaignError] = useState<string | null>(null);
  const [earningsError, setEarningsError] = useState<string | null>(null);
  const [payoutError, setPayoutError] = useState<string | null>(null);

  const seenCompletedPayoutsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const fetchCampaigns = async () => {
      setLoadingCampaigns(true);

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
        setWalletInput(payload.data.walletAddress ?? "");
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

  const saveWalletAddress = async () => {
    if (!user?.id || !walletInput.trim()) {
      return;
    }

    setWalletSaving(true);
    setPayoutError(null);

    try {
      const response = await fetch(`${apiBaseUrl}/api/users/${user.id}/wallet`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          walletAddress: walletInput.trim()
        })
      });

      const payload = (await response.json()) as ApiResponse<{ id: string; walletAddress: string }>;

      if (!response.ok || !payload.success || !payload.data) {
        setPayoutError(payload.error ?? "Failed to save wallet");
        return;
      }

      const walletData = payload.data;

      setPayoutHistory((previous) =>
        previous
          ? {
              ...previous,
              walletAddress: walletData.walletAddress
            }
          : previous
      );

      pushToast({
        type: "success",
        title: "Wallet connected",
        message: "Your Stellar wallet is ready for incoming payouts."
      });
    } catch {
      setPayoutError("Failed to save wallet");
    } finally {
      setWalletSaving(false);
    }
  };

  const claimPendingPayout = async (campaignId: string, payoutId: string) => {
    if (!user?.id) {
      return;
    }

    setClaimingPayoutId(payoutId);
    setPayoutError(null);

    try {
      const response = await fetch(`${apiBaseUrl}/api/users/${user.id}/payouts/${campaignId}/claim`, {
        method: "POST",
        credentials: "include"
      });

      const payload = (await response.json()) as ApiResponse<{
        id: string;
        status: "COMPLETED" | "FAILED";
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

  const timestampFormatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  });

  const formatXlm = (value: number) => currencyFormatter.format(value);

  const formatTimestamp = (value: string) => {
    const parsed = new Date(value);

    return Number.isNaN(parsed.getTime()) ? value : timestampFormatter.format(parsed);
  };

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

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 md:py-8 lg:px-10">
      <section className="mx-auto grid w-full max-w-7xl gap-6 lg:gap-8 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <header className="space-y-3">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">Campaign Dashboard</p>
            <h1 className="text-2xl font-semibold text-secondary sm:text-3xl lg:text-4xl">
              Discover active reward campaigns
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-muted">
              Join campaigns, submit high-performing content, and climb the leaderboard to earn payout allocation.
            </p>
          </header>

          {loadingCampaigns ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={`campaign-skeleton-${index}`} className="rounded-lg border border-border bg-surface p-5">
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="mt-3 h-4 w-full" />
                  <Skeleton className="mt-2 h-4 w-5/6" />
                  <Skeleton className="mt-5 h-2 w-full" />
                  <div className="mt-6 flex justify-between">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-8 w-28" />
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {campaignError ? <p className="text-sm text-danger">{campaignError}</p> : null}

          {!loadingCampaigns && !campaignError && campaigns.length > 0 ? (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              {campaigns.map((campaign) => (
                <CampaignCard key={campaign.id} {...campaign} />
              ))}
            </div>
          ) : null}

          {!loadingCampaigns && !campaignError && campaigns.length === 0 ? (
            <EmptyState
              variant="campaigns"
              title="No campaigns yet"
              description="Campaigns will appear here as soon as founders launch them."
            />
          ) : null}
        </div>

        {user?.role === "USER" ? (
          <aside className="space-y-6">
            <section
              className="space-y-5 rounded-lg border border-border p-5 md:p-6"
              style={{
                background:
                  "linear-gradient(140deg, color-mix(in srgb, var(--color-success) 10%, white), var(--color-surface))",
                boxShadow: "0 20px 45px color-mix(in srgb, var(--color-success) 10%, transparent)"
              }}
            >
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-success">My Earnings</p>
                  <h2 className="mt-1 text-xl font-semibold text-secondary sm:text-2xl">Estimated campaign payouts</h2>
                </div>
                <p className="text-xs font-medium text-muted">Estimated — final payout on campaign end</p>
              </div>

              <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
                <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-secondary">Profile Badges</h3>
                <p className="text-xs text-muted">Badge assignment is computed client-side in this UI pass.</p>
                {profileBadges.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {profileBadges.map((badge) => (
                      <Badge key={`profile-${badge}`} badge={badge} />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted">Complete campaigns and increase your score to unlock badges.</p>
                )}
              </section>

              {loadingEarnings ? (
                <div className="space-y-2 rounded-lg border border-border bg-surface p-4">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : null}

              {earningsError ? <p className="text-sm text-danger">{earningsError}</p> : null}

              {!loadingEarnings && !earningsError && earnings.length === 0 ? (
                <p className="text-sm text-muted">
                  No verified earnings yet. Once your posts are verified, payout projections will appear here.
                </p>
              ) : null}

              {!loadingEarnings && !earningsError && earnings.length > 0 ? (
                <div className="overflow-hidden rounded-lg border border-border bg-surface">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-border text-left text-sm">
                      <thead className="bg-background text-xs uppercase tracking-[0.16em] text-muted">
                        <tr>
                          <th className="px-4 py-3 font-semibold">Campaign</th>
                          <th className="px-4 py-3 font-semibold">Posts</th>
                          <th className="px-4 py-3 font-semibold">Current Score</th>
                          <th className="px-4 py-3 font-semibold">Estimated Payout (XLM)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {earnings.map((entry) => (
                          <tr key={entry.campaignId} className="align-top">
                            <td className="px-4 py-4">
                              <div className="space-y-1">
                                <p className="font-semibold text-secondary">{entry.campaignTitle}</p>
                                <p className="text-xs text-muted">Updated {formatTimestamp(entry.lastUpdatedAt)}</p>
                              </div>
                            </td>
                            <td className="px-4 py-4 font-medium text-secondary">{entry.posts}</td>
                            <td className="px-4 py-4 font-medium text-secondary">{entry.currentScore.toFixed(2)}</td>
                            <td className="px-4 py-4 font-semibold text-success">{formatXlm(entry.estimatedPayout)} XLM</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              <div className="space-y-4 rounded-lg border border-border bg-surface p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-secondary">Payout History</h3>
                  <span className="text-xs text-muted">Links open on Stellar testnet explorer</span>
                </div>

                {!payoutHistory?.walletAddress ? (
                  <div className="space-y-2 rounded-md border border-border bg-background p-3">
                    <p className="text-sm text-muted">Connect Wallet to receive XLM payouts.</p>
                    <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                      <input
                        type="text"
                        value={walletInput}
                        onChange={(event) => setWalletInput(event.target.value)}
                        placeholder="G... Stellar public key"
                        className="min-w-0 rounded-md border border-border bg-surface px-3 py-2 text-sm text-secondary outline-none focus:border-primary"
                      />
                      <button
                        type="button"
                        onClick={saveWalletAddress}
                        disabled={walletSaving || walletInput.trim().length === 0}
                        className="rounded-md border border-border px-3 py-2 text-sm font-semibold text-secondary disabled:opacity-60"
                        style={{
                          background:
                            "linear-gradient(120deg, color-mix(in srgb, var(--color-primary) 16%, white), var(--color-surface))"
                        }}
                      >
                        {walletSaving ? "Saving..." : "Connect Wallet"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted">
                    Wallet connected: <span className="font-semibold text-secondary">{payoutHistory.walletAddress}</span>
                  </p>
                )}

                {loadingPayoutHistory ? (
                  <div className="space-y-2">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                ) : null}

                {payoutError ? <p className="text-sm text-danger">{payoutError}</p> : null}

                {!loadingPayoutHistory && payoutHistory && payoutHistory.payouts.length === 0 ? (
                  <EmptyState
                    variant="payouts"
                    title="No payouts"
                    description="Payout history will show here once campaign distributions begin."
                  />
                ) : null}

                {!loadingPayoutHistory && payoutHistory && payoutHistory.payouts.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-border text-left text-sm">
                      <thead className="bg-background text-xs uppercase tracking-[0.14em] text-muted">
                        <tr>
                          <th className="px-3 py-2 font-semibold">Campaign</th>
                          <th className="px-3 py-2 font-semibold">Amount</th>
                          <th className="px-3 py-2 font-semibold">Status</th>
                          <th className="px-3 py-2 font-semibold">Tx</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {payoutHistory.payouts.map((payout) => (
                          <tr key={payout.id}>
                            <td className="px-3 py-3">
                              <p className="font-semibold text-secondary">{payout.campaignTitle}</p>
                            </td>
                            <td className="px-3 py-3 font-medium text-secondary">{formatXlm(payout.amount)} XLM</td>
                            <td className="px-3 py-3">
                              <span
                                className="rounded-full border px-2 py-1 text-xs font-semibold"
                                style={{
                                  color:
                                    payout.status === "COMPLETED"
                                      ? "var(--color-success)"
                                      : payout.status === "FAILED"
                                        ? "var(--color-danger)"
                                        : "var(--color-accent)",
                                  borderColor:
                                    payout.status === "COMPLETED"
                                      ? "color-mix(in srgb, var(--color-success) 42%, var(--color-border))"
                                      : payout.status === "FAILED"
                                        ? "color-mix(in srgb, var(--color-danger) 38%, var(--color-border))"
                                        : "color-mix(in srgb, var(--color-accent) 42%, var(--color-border))",
                                  backgroundColor:
                                    payout.status === "COMPLETED"
                                      ? "color-mix(in srgb, var(--color-success) 16%, var(--color-surface))"
                                      : payout.status === "FAILED"
                                        ? "color-mix(in srgb, var(--color-danger) 14%, var(--color-surface))"
                                        : "color-mix(in srgb, var(--color-accent) 18%, var(--color-surface))"
                                }}
                              >
                                {payout.status}
                              </span>
                            </td>
                            <td className="px-3 py-3">
                              {payout.stellarTxUrl ? (
                                <a
                                  href={payout.stellarTxUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-xs font-semibold text-secondary underline"
                                >
                                  {payout.stellarTxHash}
                                </a>
                              ) : payout.status === "PENDING" ? (
                                <button
                                  type="button"
                                  onClick={() => claimPendingPayout(payout.campaignId, payout.id)}
                                  disabled={
                                    claimingPayoutId === payout.id ||
                                    !payoutHistory.walletAddress ||
                                    payoutHistory.walletAddress.length === 0
                                  }
                                  className="rounded-md border border-border px-2 py-1 text-xs font-semibold text-secondary disabled:opacity-60"
                                  style={{
                                    background:
                                      "linear-gradient(120deg, color-mix(in srgb, var(--color-secondary) 16%, white), var(--color-surface))"
                                  }}
                                >
                                  {claimingPayoutId === payout.id ? "Claiming..." : "Claim"}
                                </button>
                              ) : (
                                <span className="text-xs text-muted">Not available</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            </section>
          </aside>
        ) : null}
      </section>
    </main>
  );
}

export default withAuth(DashboardPage);
