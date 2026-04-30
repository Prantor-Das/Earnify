"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { ApiResponse, CampaignStatus } from "@virlo/shared";

import { CampaignCard } from "../../../components/CampaignCard";
import { Skeleton } from "../../../components/Skeleton";
import { withAuth } from "../../../components/auth/withAuth";
import { useToast } from "../../../components/toast/ToastProvider";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

type Tab = "overview" | "campaigns" | "insights";

type FounderStats = {
  totalBudgetDeployed: number;
  totalReach: number;
  activeCampaigns: number;
  engagementRate: number;
};

type FounderCampaign = {
  id: string;
  title: string;
  description: string;
  totalBudget: number;
  remainingBudget: number;
  status: CampaignStatus;
  postCount: number;
  founderId: string;
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

type CreatorMatch = {
  id: string;
  name: string;
  avatar?: string | null;
  score: number;
  breakdown: {
    platformFit: number;
    engagementQuality: number;
    trackRecord: number;
  };
};

const tabs: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "campaigns", label: "My Campaigns" },
  { id: "insights", label: "Creator Insights" },
];

function MetricCard({
  label,
  value,
  loading,
}: {
  label: string;
  value: string;
  loading: boolean;
}) {
  return (
    <article className="border border-[#E5E5E5] bg-[#FAFAFA] p-5 [border-radius:6px]">
      <p className="text-xs font-medium uppercase text-[#525252]">{label}</p>
      {loading ? (
        <Skeleton className="mt-4 h-8 w-28" />
      ) : (
        <p className="mt-3 text-3xl font-medium text-[#0A0A0A]">{value}</p>
      )}
    </article>
  );
}

function FounderDashboardPage() {
  const { pushToast } = useToast();
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<FounderStats | null>(null);
  const [campaigns, setCampaigns] = useState<FounderCampaign[]>([]);
  const [creatorMatches, setCreatorMatches] = useState<
    Record<string, CreatorMatch[]>
  >({});
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(
    null,
  );
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadStats() {
      setLoadingStats(true);
      try {
        const response = await fetch(`${apiBaseUrl}/api/dashboard/founder`, {
          credentials: "include",
        });
        const payload = (await response.json()) as ApiResponse<FounderStats>;
        if (!cancelled && payload.success && payload.data) {
          setStats(payload.data);
        }
      } catch {
        if (!cancelled) {
          setError("Failed to load founder metrics");
          pushToast({
            type: "error",
            title: "Metrics unavailable",
            message: "Failed to load founder metrics.",
          });
        }
      } finally {
        if (!cancelled) setLoadingStats(false);
      }
    }

    async function loadTopMatches(campaignIds: string[]) {
      const entries = await Promise.all(
        campaignIds.map(async (campaignId) => {
          const response = await fetch(
            `${apiBaseUrl}/api/campaigns/${campaignId}/top-matches`,
            { credentials: "include" },
          );
          const payload = (await response.json()) as ApiResponse<{
            matches: CreatorMatch[];
          }>;

          if (!response.ok || !payload.success || !payload.data) {
            throw new Error(payload.error ?? "Failed to load top matches");
          }

          return [campaignId, payload.data.matches] as const;
        }),
      );

      return Object.fromEntries(entries);
    }

    async function loadCampaigns() {
      setLoadingCampaigns(true);
      try {
        const response = await fetch(`${apiBaseUrl}/api/campaigns?founder=me`, {
          credentials: "include",
        });
        const payload = (await response.json()) as ApiResponse<
          FounderCampaign[]
        >;
        if (!cancelled && payload.success && payload.data) {
          setCampaigns(payload.data);
          try {
            const matches = await loadTopMatches(
              payload.data.map((campaign) => campaign.id),
            );
            if (!cancelled) {
              setCreatorMatches(matches);
            }
          } catch {
            if (!cancelled) {
              pushToast({
                type: "error",
                title: "Top matches unavailable",
                message: "Campaigns loaded, but creator matches did not.",
              });
            }
          }
        }
      } catch {
        if (!cancelled) {
          setError("Failed to load campaigns");
          pushToast({
            type: "error",
            title: "Campaigns unavailable",
            message: "Failed to load campaigns.",
          });
        }
      } finally {
        if (!cancelled) setLoadingCampaigns(false);
      }
    }

    void loadStats();
    void loadCampaigns();
    return () => {
      cancelled = true;
    };
  }, [pushToast]);

  const selectedCampaign =
    campaigns.find((campaign) => campaign.id === selectedCampaignId) ?? null;
  const selectedMatches = selectedCampaignId
    ? (creatorMatches[selectedCampaignId] ?? [])
    : [];

  return (
    <main className="min-h-screen bg-[#FAFAFA] px-5 py-10 text-[#0A0A0A]">
      <section className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col justify-between gap-4 border-b border-[#E5E5E5] pb-6 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-medium uppercase text-[#525252]">
              Founder Dashboard
            </p>
            <h1 className="mt-3 text-4xl font-medium">
              Campaign command center
            </h1>
          </div>
          <Link
            href="/campaign/create"
            className="inline-flex w-fit items-center justify-center border border-[#F59E0B] bg-[#F59E0B] px-5 py-3 text-sm font-medium text-[#0A0A0A] hover:bg-[#D97706] [border-radius:6px]"
          >
            Create Campaign
          </Link>
        </header>

        <div className="flex flex-wrap gap-2 border border-[#E5E5E5] bg-[#F5F5F5] p-2 [border-radius:8px]">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium [border-radius:6px] ${
                activeTab === tab.id
                  ? "bg-[#0A0A0A] text-[#FAFAFA]"
                  : "text-[#525252] hover:text-[#0A0A0A]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {error ? (
          <p className="border border-[#525252] p-3 text-sm text-[#525252] [border-radius:6px]">
            {error}
          </p>
        ) : null}

        {activeTab === "overview" ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Total Budget Deployed"
              value={`${(stats?.totalBudgetDeployed ?? 0).toFixed(2)} XLM`}
              loading={loadingStats}
            />
            <MetricCard
              label="Total Reach"
              value={(stats?.totalReach ?? 0).toLocaleString()}
              loading={loadingStats}
            />
            <MetricCard
              label="Active Campaigns"
              value={String(stats?.activeCampaigns ?? 0)}
              loading={loadingStats}
            />
            <MetricCard
              label="Engagement Rate"
              value={`${(stats?.engagementRate ?? 0).toFixed(2)}%`}
              loading={loadingStats}
            />
          </div>
        ) : null}

        {activeTab === "campaigns" ? (
          <section>
            {loadingCampaigns ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {[0, 1, 2].map((item) => (
                  <Skeleton key={item} className="h-72 w-full" />
                ))}
              </div>
            ) : campaigns.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {campaigns.map((campaign) => (
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
                      createdAt: campaign.createdAt,
                    }}
                    topMatches={(creatorMatches[campaign.id] ?? []).slice(
                      0,
                      3,
                    )}
                    onOpenShortlist={() => setSelectedCampaignId(campaign.id)}
                  />
                ))}
              </div>
            ) : (
              <p className="border border-[#E5E5E5] p-8 text-center text-[#525252] [border-radius:6px]">
                No founder campaigns yet.
              </p>
            )}
          </section>
        ) : null}

        {activeTab === "insights" ? (
          <section className="grid gap-4 md:grid-cols-3">
            {[
              [
                "Creators Reached",
                campaigns.reduce((sum, c) => sum + c.postCount, 0),
              ],
              ["Campaigns Launched", campaigns.length],
              [
                "Average Budget",
                campaigns.length
                  ? (
                      campaigns.reduce((sum, c) => sum + c.totalBudget, 0) /
                      campaigns.length
                    ).toFixed(2)
                  : "0.00",
              ],
            ].map(([label, value]) => (
              <article
                key={label}
                className="border border-[#E5E5E5] bg-[#FAFAFA] p-5 [border-radius:6px]"
              >
                <p className="text-xs font-medium uppercase text-[#525252]">
                  {label}
                </p>
                <p className="mt-3 text-3xl font-medium">{value}</p>
              </article>
            ))}
          </section>
        ) : null}
      </section>

      {selectedCampaign ? (
        <div className="fixed inset-0 z-40 bg-black/30">
          <button
            type="button"
            aria-label="Close creator shortlist"
            className="absolute inset-0 h-full w-full cursor-default"
            onClick={() => setSelectedCampaignId(null)}
          />
          <aside className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto bg-[#FAFAFA] p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-[#E5E5E5] pb-5">
              <div>
                <p className="text-xs font-medium uppercase text-[#525252]">
                  Creator Shortlist
                </p>
                <h2 className="mt-2 text-2xl font-medium">
                  {selectedCampaign.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCampaignId(null)}
                className="border border-[#E5E5E5] px-3 py-1.5 text-sm font-medium hover:border-[#0A0A0A] [border-radius:6px]"
              >
                Close
              </button>
            </div>

            <div className="mt-5 space-y-3">
              {selectedMatches.length > 0 ? (
                selectedMatches.map((creator, index) => (
                  <article
                    key={creator.id}
                    className="border border-[#E5E5E5] bg-white p-4 [border-radius:6px]"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        {creator.avatar ? (
                          <img
                            src={creator.avatar}
                            alt=""
                            className="h-10 w-10 shrink-0 rounded-full object-cover"
                          />
                        ) : (
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#E5E5E5] text-sm font-medium">
                            {creator.name.slice(0, 1).toUpperCase()}
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {index + 1}. {creator.name}
                          </p>
                          <p className="mt-1 text-xs text-[#525252]">
                            Platform {creator.breakdown.platformFit}% ·
                            Engagement {creator.breakdown.engagementQuality}% ·
                            Track {creator.breakdown.trackRecord}%
                          </p>
                        </div>
                      </div>
                      <span className="shrink-0 border border-[#16A34A] bg-[#DCFCE7] px-2.5 py-1 text-xs font-medium text-[#166534] [border-radius:999px]">
                        {creator.score}%
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        pushToast({
                          type: "info",
                          title: "Invite queued",
                          message: `${creator.name} invite action is ready for wiring.`,
                        })
                      }
                      className="mt-4 w-full border border-[#F59E0B] bg-[#F59E0B] px-4 py-2 text-sm font-medium text-[#0A0A0A] hover:bg-[#D97706] [border-radius:6px]"
                    >
                      Invite
                    </button>
                  </article>
                ))
              ) : (
                <p className="border border-[#E5E5E5] p-6 text-center text-sm text-[#525252] [border-radius:6px]">
                  No creator matches yet.
                </p>
              )}
            </div>
          </aside>
        </div>
      ) : null}
    </main>
  );
}

export default withAuth(FounderDashboardPage, { role: "FOUNDER" });
