"use client";

import { useEffect, useState } from "react";

import type { ApiResponse, CampaignStatus } from "@virlo/shared";

import { CampaignCard } from "../../components/CampaignCard";
import { Skeleton } from "../../components/Skeleton";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

type CampaignListItem = {
  id: string;
  title: string;
  description: string;
  totalBudget: number;
  remainingBudget: number;
  status: CampaignStatus;
  platforms: string[];
  postCount: number;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  founder?: {
    id: string;
    name: string;
    avatar?: string | null;
  };
};

type CampaignBucket = "live" | "upcoming" | "ended";

const buckets: Array<{ id: CampaignBucket; title: string }> = [
  { id: "live", title: "Live Campaigns" },
  { id: "upcoming", title: "Upcoming Campaigns" },
  { id: "ended", title: "Past Campaigns" },
];

export default function CampaignIndexPage() {
  const [campaigns, setCampaigns] = useState<
    Record<CampaignBucket, CampaignListItem[]>
  >({
    live: [],
    upcoming: [],
    ended: [],
  });
  const [loading, setLoading] = useState(true);
  const [pastOpen, setPastOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadBucket(bucket: CampaignBucket) {
      const response = await fetch(
        `${apiBaseUrl}/api/campaigns?status=${bucket}`,
        {
          credentials: "include",
          cache: "no-store",
        },
      );
      const payload = (await response.json()) as ApiResponse<
        CampaignListItem[]
      >;
      return payload.success && payload.data ? payload.data : [];
    }

    async function loadCampaigns() {
      setLoading(true);
      try {
        const [live, upcoming, ended] = await Promise.all([
          loadBucket("live"),
          loadBucket("upcoming"),
          loadBucket("ended"),
        ]);

        if (!cancelled) {
          setCampaigns({ live, upcoming, ended });
        }
      } catch {
        if (!cancelled) {
          setCampaigns({ live: [], upcoming: [], ended: [] });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadCampaigns();
    return () => {
      cancelled = true;
    };
  }, []);

  const renderGrid = (items: CampaignListItem[]) => {
    if (loading) {
      return (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <Skeleton key={item} className="h-72 w-full" />
          ))}
        </div>
      );
    }

    if (items.length === 0) {
      return (
        <div className="border border-[#E5E5E5] bg-[#F5F5F5] p-8 text-center text-sm text-[#525252] [border-radius:6px]">
          No campaigns in this section.
        </div>
      );
    }

    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((campaign) => (
          <CampaignCard
            key={campaign.id}
            showMatchScore
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
              createdAt: campaign.createdAt,
            }}
          />
        ))}
      </div>
    );
  };

  return (
    <main className="min-h-screen bg-[#FAFAFA] px-5 py-16 text-[#0A0A0A]">
      <section className="mx-auto max-w-7xl space-y-12">
        <header className="border-b border-[#E5E5E5] pb-6">
          <p className="text-sm font-medium uppercase text-[#525252]">
            Campaigns
          </p>
          <h1 className="mt-3 text-5xl font-medium">Explore Campaigns</h1>
        </header>

        {buckets.slice(0, 2).map((bucket) => (
          <section key={bucket.id} className="space-y-5">
            <div className="flex items-end justify-between gap-4">
              <h2 className="text-2xl font-medium">{bucket.title}</h2>
              <span className="text-sm text-[#525252]">
                {campaigns[bucket.id].length} campaigns
              </span>
            </div>
            {renderGrid(campaigns[bucket.id])}
          </section>
        ))}

        <section className="border border-[#E5E5E5] bg-[#F5F5F5] [border-radius:6px]">
          <button
            type="button"
            onClick={() => setPastOpen((value) => !value)}
            className="flex w-full items-center justify-between px-5 py-4 text-left"
          >
            <span className="text-2xl font-medium">Past Campaigns</span>
            <span className="text-sm text-[#525252]">
              {pastOpen ? "Hide" : "Show"} ({campaigns.ended.length})
            </span>
          </button>
          {pastOpen ? (
            <div className="px-5 pb-5">{renderGrid(campaigns.ended)}</div>
          ) : null}
        </section>
      </section>
    </main>
  );
}
