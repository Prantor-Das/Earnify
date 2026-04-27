"use client";

import { useEffect, useMemo, useState } from "react";

import type { ApiResponse, CampaignStatus } from "@earnify/shared";

import { CampaignCard } from "../../../components/CampaignCard";
import { EmptyState } from "../../../components/EmptyState";
import { Skeleton } from "../../../components/Skeleton";
import { useAuth } from "../../../components/auth/AuthProvider";
import { withAuth } from "../../../components/auth/withAuth";
import { useToast } from "../../../components/toast/ToastProvider";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

type DashboardCampaign = {
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

type CampaignSegment = "live" | "upcoming" | "ended";

function classifyCampaignSegment(campaign: DashboardCampaign): CampaignSegment {
  const now = Date.now();
  const endTime = campaign.endDate ? new Date(campaign.endDate).getTime() : Number.POSITIVE_INFINITY;
  const endedByDate = Number.isFinite(endTime) && endTime <= now;

  if (campaign.status === "ENDED" || campaign.status === "COMPLETED" || endedByDate) {
    return "ended";
  }

  if (campaign.status === "ACTIVE") {
    return "live";
  }

  return "upcoming";
}

function FounderDashboardPage() {
  const { user, switchRole } = useAuth();
  const { pushToast } = useToast();

  const [campaigns, setCampaigns] = useState<DashboardCampaign[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [campaignError, setCampaignError] = useState<string | null>(null);
  const [switchingRole, setSwitchingRole] = useState(false);
  const [campaignTab, setCampaignTab] = useState<CampaignSegment>("live");

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

        const ownCampaigns = payload.data.filter((campaign) => campaign.founderId === user?.id);
        setCampaigns(ownCampaigns);
      } catch {
        setCampaignError("Failed to load campaigns");
      } finally {
        setLoadingCampaigns(false);
      }
    };

    void fetchCampaigns();
  }, [user?.id]);

  const stats = useMemo(() => {
    const totalBudget = campaigns.reduce((sum, campaign) => sum + campaign.totalBudget, 0);
    const activeCount = campaigns.filter((campaign) => campaign.status === "ACTIVE").length;
    const endedCount = campaigns.filter((campaign) => classifyCampaignSegment(campaign) === "ended").length;
    const totalParticipants = campaigns.reduce((sum, campaign) => sum + campaign.postCount, 0);

    return {
      totalBudget,
      activeCount,
      endedCount,
      totalParticipants
    };
  }, [campaigns]);

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

  const handleSwitchToUser = async () => {
    setSwitchingRole(true);
    const ok = await switchRole("USER");

    if (!ok) {
      pushToast({
        type: "warning",
        title: "Role update failed",
        message: "Please try again."
      });
    } else {
      pushToast({
        type: "success",
        title: "User mode enabled",
        message: "Redirecting to creator dashboard."
      });
      window.location.href = "/dashboard";
    }

    setSwitchingRole(false);
  };

  return (
    <main className="min-h-screen pb-16">
      <section className="mx-auto w-full max-w-7xl space-y-7 px-4 py-8 sm:px-6 lg:px-8">
        <header className="surface-card rounded-sm p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-primary)]">Founder Console</p>
          <h1 className="mt-3 text-3xl font-semibold text-zinc-100">Manage campaign lifecycle</h1>
          <p className="mt-3 max-w-3xl text-sm text-zinc-400">
            Monitor campaign health, separate active and ended initiatives, and keep campaign operations clean.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <a
              href="/campaign/create"
              className="inline-flex items-center border border-[var(--color-primary)] bg-[var(--color-primary)] px-4 py-2 text-xs font-bold uppercase tracking-[0.09em] text-black"
            >
              Create Campaign
            </a>
            <button
              type="button"
              onClick={() => {
                void handleSwitchToUser();
              }}
              disabled={switchingRole}
              className="inline-flex items-center border border-zinc-700 px-4 py-2 text-xs font-bold uppercase tracking-[0.09em] text-zinc-200 disabled:opacity-60"
            >
              {switchingRole ? "Switching..." : "Switch to User"}
            </button>
          </div>
        </header>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <article className="surface-card rounded-sm p-5">
            <p className="text-[11px] uppercase tracking-[0.1em] text-zinc-500">Total Campaigns</p>
            <p className="mt-2 text-2xl font-semibold text-zinc-100">{campaigns.length}</p>
          </article>
          <article className="surface-card rounded-sm p-5">
            <p className="text-[11px] uppercase tracking-[0.1em] text-zinc-500">Live</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--color-primary)]">{stats.activeCount}</p>
          </article>
          <article className="surface-card rounded-sm p-5">
            <p className="text-[11px] uppercase tracking-[0.1em] text-zinc-500">Ended</p>
            <p className="mt-2 text-2xl font-semibold text-zinc-200">{stats.endedCount}</p>
          </article>
          <article className="surface-card rounded-sm p-5">
            <p className="text-[11px] uppercase tracking-[0.1em] text-zinc-500">Total Budget</p>
            <p className="mt-2 text-2xl font-semibold text-zinc-100">{stats.totalBudget.toFixed(2)} XLM</p>
            <p className="mt-1 text-xs text-zinc-500">Participants: {stats.totalParticipants}</p>
          </article>
        </div>

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
                <div key={`founder-campaign-skeleton-${index}`} className="surface-card rounded-sm p-6">
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="mt-3 h-6 w-2/3" />
                  <Skeleton className="mt-4 h-4 w-full" />
                  <Skeleton className="mt-7 h-10 w-full" />
                </div>
              ))}
            </div>
          ) : null}

          {campaignError ? <p className="text-sm text-[var(--color-danger)]">{campaignError}</p> : null}

          {!loadingCampaigns && !campaignError && segmentedCampaigns[campaignTab].length > 0 ? (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              {segmentedCampaigns[campaignTab].map((campaign) => (
                <CampaignCard
                  key={campaign.id}
                  campaign={{
                    id: campaign.id,
                    title: campaign.title,
                    description: campaign.description,
                    budgetTotal: campaign.totalBudget,
                    budgetRemaining: campaign.remainingBudget,
                    participants: campaign.postCount,
                    founder: campaign.founder,
                    platforms: campaign.platforms,
                    status: campaign.status,
                    endDate: campaign.endDate,
                    startDate: campaign.startDate,
                    createdAt: campaign.createdAt
                  }}
                />
              ))}
            </div>
          ) : null}

          {!loadingCampaigns && !campaignError && segmentedCampaigns[campaignTab].length === 0 ? (
            <EmptyState
              variant="campaigns"
              title={`No ${campaignTab} campaigns`}
              description="Campaigns move between sections automatically based on real backend status."
            />
          ) : null}
        </section>
      </section>
    </main>
  );
}

export default withAuth(FounderDashboardPage, { role: "FOUNDER" });
