"use client";

import { useEffect, useState } from "react";

import type { ApiResponse, CampaignStatus } from "@earnify/shared";

import { useAuth } from "../../components/auth/AuthProvider";
import { withAuth } from "../../components/auth/withAuth";
import { CampaignCard } from "../../components/CampaignCard";

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

function DashboardPage() {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<DashboardCampaign[]>([]);
  const [earnings, setEarnings] = useState<MyEarningsCampaign[]>([]);
  const [payoutHistory, setPayoutHistory] = useState<UserPayoutHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [earningsLoading, setEarningsLoading] = useState(true);
  const [payoutHistoryLoading, setPayoutHistoryLoading] = useState(true);
  const [walletInput, setWalletInput] = useState("");
  const [walletSaving, setWalletSaving] = useState(false);
  const [claimingPayoutId, setClaimingPayoutId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [earningsError, setEarningsError] = useState<string | null>(null);
  const [payoutError, setPayoutError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCampaigns = async () => {
      setLoading(true);

      try {
        const response = await fetch(`${apiBaseUrl}/api/campaigns`, {
          method: "GET",
          credentials: "include"
        });

        const payload = (await response.json()) as ApiResponse<DashboardCampaign[]>;

        if (!response.ok || !payload.success || !payload.data) {
          setError(payload.error ?? "Failed to load campaigns");
          return;
        }

        setCampaigns(payload.data);
      } catch {
        setError("Failed to load campaigns");
      } finally {
        setLoading(false);
      }
    };

    void fetchCampaigns();
  }, []);

  useEffect(() => {
    if (user?.role !== "USER") {
      setEarnings([]);
      setEarningsLoading(false);
      setEarningsError(null);
      return;
    }

    const fetchEarnings = async () => {
      setEarningsLoading(true);

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
        setEarningsLoading(false);
      }
    };

    void fetchEarnings();
  }, [user?.role]);

  useEffect(() => {
    if (user?.role !== "USER" || !user.id) {
      setPayoutHistory(null);
      setPayoutHistoryLoading(false);
      setPayoutError(null);
      return;
    }

    const fetchPayoutHistory = async () => {
      setPayoutHistoryLoading(true);
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
        setPayoutHistoryLoading(false);
      }
    };

    void fetchPayoutHistory();
  }, [user?.id, user?.role]);

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

      const savedWalletAddress = payload.data.walletAddress;

      setPayoutHistory((previous) =>
        previous
          ? {
              ...previous,
              walletAddress: savedWalletAddress
            }
          : previous
      );
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

      const payload = (await response.json()) as ApiResponse<{ id: string; status: "COMPLETED" | "FAILED"; stellarTxHash?: string | null; stellarTxUrl?: string | null }>;

      if (!response.ok || !payload.success || !payload.data) {
        setPayoutError(payload.error ?? "Failed to claim payout");
        return;
      }

      setPayoutHistory((previous) => {
        if (!previous) {
          return previous;
        }

        return {
          ...previous,
          payouts: previous.payouts.map((payout) =>
            payout.id === payload.data?.id
              ? {
                  ...payout,
                  status: payload.data.status,
                  stellarTxHash: payload.data.stellarTxHash ?? null,
                  stellarTxUrl: payload.data.stellarTxUrl ?? null
                }
              : payout
          )
        };
      });
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

  return (
    <main className="min-h-screen px-4 py-10 sm:px-6 lg:px-10">
      <section className="mx-auto w-full max-w-7xl space-y-8">
        <header className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">Campaign Dashboard</p>
          <h1 className="text-3xl font-semibold text-secondary sm:text-4xl">Discover active reward campaigns</h1>
          <p className="max-w-3xl text-sm leading-7 text-muted">
            Join campaigns, submit high-performing content, and climb the leaderboard to earn payout allocation.
          </p>
        </header>

        {loading ? <p className="text-sm text-muted">Loading campaigns...</p> : null}
        {error ? <p className="text-sm text-danger">{error}</p> : null}

        {!loading && !error ? (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {campaigns.map((campaign) => (
              <CampaignCard key={campaign.id} {...campaign} />
            ))}
          </div>
        ) : null}

        {!loading && !error && campaigns.length === 0 ? (
          <p className="text-sm text-muted">No active campaigns are available right now.</p>
        ) : null}

        {user?.role === "USER" ? (
          <section
            className="space-y-5 rounded-lg border border-border p-6"
            style={{
              background:
                "linear-gradient(140deg, color-mix(in srgb, var(--color-success) 10%, white), var(--color-surface))",
              boxShadow: "0 20px 45px color-mix(in srgb, var(--color-success) 10%, transparent)"
            }}
          >
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-success">My Earnings</p>
                <h2 className="mt-1 text-2xl font-semibold text-secondary">Estimated campaign payouts</h2>
              </div>

              <p className="text-xs font-medium text-muted">Estimated — final payout on campaign end</p>
            </div>

            {earningsLoading ? <p className="text-sm text-muted">Loading earnings...</p> : null}
            {earningsError ? <p className="text-sm text-danger">{earningsError}</p> : null}

            {!earningsLoading && !earningsError && earnings.length === 0 ? (
              <p className="text-sm text-muted">
                No verified earnings yet. Once your posts are verified, payouts will appear here.
              </p>
            ) : null}

            {!earningsLoading && !earningsError && earnings.length > 0 ? (
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
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-secondary">Payout History</h3>
                <span className="text-xs text-muted">Links open on Stellar testnet explorer</span>
              </div>

              {!payoutHistory?.walletAddress ? (
                <div className="space-y-2 rounded-md border border-border bg-background p-3">
                  <p className="text-sm text-muted">Connect Wallet to receive XLM payouts.</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={walletInput}
                      onChange={(event) => setWalletInput(event.target.value)}
                      placeholder="G... Stellar public key"
                      className="min-w-[16rem] flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-secondary outline-none focus:border-primary"
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

              {payoutHistoryLoading ? <p className="text-sm text-muted">Loading payout history...</p> : null}
              {payoutError ? <p className="text-sm text-danger">{payoutError}</p> : null}

              {!payoutHistoryLoading && payoutHistory && payoutHistory.payouts.length === 0 ? (
                <p className="text-sm text-muted">No payouts yet.</p>
              ) : null}

              {!payoutHistoryLoading && payoutHistory && payoutHistory.payouts.length > 0 ? (
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
                                  claimingPayoutId === payout.id || !payoutHistory.walletAddress || payoutHistory.walletAddress.length === 0
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
        ) : null}
      </section>
    </main>
  );
}

export default withAuth(DashboardPage);
