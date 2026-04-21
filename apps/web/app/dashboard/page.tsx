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
  const [loading, setLoading] = useState(true);
  const [earningsLoading, setEarningsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [earningsError, setEarningsError] = useState<string | null>(null);

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
          </section>
        ) : null}
      </section>
    </main>
  );
}

export default withAuth(DashboardPage);
