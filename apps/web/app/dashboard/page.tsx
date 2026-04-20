"use client";

import { useEffect, useState } from "react";

import type { ApiResponse, CampaignStatus } from "@earnify/shared";

import { withAuth } from "../../components/auth/withAuth";
import { CampaignCard } from "../../components/CampaignCard";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

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
  const [campaigns, setCampaigns] = useState<DashboardCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      </section>
    </main>
  );
}

export default withAuth(DashboardPage);
