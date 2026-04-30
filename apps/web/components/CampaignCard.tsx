"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { ApiResponse, CampaignStatus } from "@virlo/shared";

import { useAuth } from "./auth/AuthProvider";
import { BudgetBar } from "./BudgetBar";
import { Skeleton } from "./Skeleton";
import { useToast } from "./toast/ToastProvider";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

type MatchBreakdown = {
  platformFit: number;
  engagementQuality: number;
  trackRecord: number;
  aiCheckRate?: number;
  postVolume?: number;
};

type MatchScore = {
  score: number;
  breakdown: MatchBreakdown;
};

type CampaignCardProps = {
  campaign: {
    id: string;
    title: string;
    description?: string;
    founder?: {
      id?: string;
      name: string;
      avatar?: string | null;
    };
    platforms: string[];
    budgetTotal: number;
    budgetRemaining: number;
    participants: number;
    status?: CampaignStatus;
    endDate?: string | null;
    startDate?: string | null;
    createdAt?: string;
  };
  showMatchScore?: boolean;
  topMatches?: Array<{
    id: string;
    name: string;
    avatar?: string | null;
    score: number;
  }>;
  onOpenShortlist?: () => void;
};

function normalizePlatform(platform: string) {
  const key = platform.toUpperCase();
  if (key === "TWITTER") return "X";
  if (key === "LINKEDIN") return "in";
  if (key === "INSTAGRAM") return "IG";
  return key.slice(0, 2);
}

function getSegment(campaign: CampaignCardProps["campaign"]) {
  const now = Date.now();
  const endTime = campaign.endDate ? new Date(campaign.endDate).getTime() : NaN;
  const startTime = campaign.startDate
    ? new Date(campaign.startDate).getTime()
    : Number.NEGATIVE_INFINITY;

  if (
    campaign.status === "ENDED" ||
    campaign.status === "COMPLETED" ||
    (!Number.isNaN(endTime) && endTime <= now)
  ) {
    return "ENDED";
  }

  if (campaign.status === "ACTIVE" && startTime <= now) {
    return "LIVE";
  }

  return "UPCOMING";
}

function getStatusClass(segment: string) {
  if (segment === "LIVE") {
    return "border-[#F59E0B] bg-[#F59E0B] text-[#0A0A0A]";
  }

  if (segment === "UPCOMING") {
    return "border-[#A3A3A3] bg-[#F5F5F5] text-[#525252]";
  }

  return "border-[#525252] bg-[#E5E5E5] text-[#525252]";
}

function getTimeLabel(endDate?: string | null) {
  if (!endDate) return "No deadline";

  const end = new Date(endDate);
  if (Number.isNaN(end.getTime())) return "No deadline";

  const diff = end.getTime() - Date.now();
  if (diff <= 0) return "Ended";

  const hours = Math.ceil(diff / (1000 * 60 * 60));
  if (hours < 48) return `${hours}h left`;

  const days = Math.ceil(hours / 24);
  return `${days}d left`;
}

function getMatchColor(score: number) {
  if (score >= 70) {
    return "border-[#16A34A] bg-[#DCFCE7] text-[#166534]";
  }

  if (score >= 40) {
    return "border-[#F59E0B] bg-[#FEF3C7] text-[#92400E]";
  }

  return "border-[#D4D4D4] bg-[#F5F5F5] text-[#525252]";
}

function MatchScorePill({
  match,
  loading,
}: {
  match: MatchScore | null;
  loading: boolean;
}) {
  if (loading) {
    return <Skeleton className="h-7 w-24" />;
  }

  if (!match) {
    return null;
  }

  return (
    <div className="group relative">
      <span
        className={`inline-flex border px-2.5 py-1 text-xs font-medium rounded-[999px] ${getMatchColor(match.score)}`}
      >
        {match.score}% match
      </span>
      <div className="pointer-events-none absolute right-0 top-9 z-20 w-56 translate-y-1 border border-[#E5E5E5] bg-[#0A0A0A] p-3 text-xs text-[#FAFAFA] opacity-0 shadow-lg transition-all group-hover:translate-y-0 group-hover:opacity-100 [border-radius:6px]">
        <div className="flex justify-between gap-3">
          <span>Platform fit</span>
          <strong>{match.breakdown.platformFit}%</strong>
        </div>
        <div className="mt-2 flex justify-between gap-3">
          <span>Engagement quality</span>
          <strong>{match.breakdown.engagementQuality}%</strong>
        </div>
        <div className="mt-2 flex justify-between gap-3">
          <span>Track record</span>
          <strong>{match.breakdown.trackRecord}%</strong>
        </div>
      </div>
    </div>
  );
}

export function CampaignCard({
  campaign,
  showMatchScore = false,
  topMatches,
  onOpenShortlist,
}: CampaignCardProps) {
  const founderName = campaign.founder?.name?.trim() || "Founder";
  const segment = getSegment(campaign);
  const { user } = useAuth();
  const { pushToast } = useToast();
  const [match, setMatch] = useState<MatchScore | null>(null);
  const [loadingMatch, setLoadingMatch] = useState(false);

  useEffect(() => {
    if (!showMatchScore || user?.role !== "USER") {
      return;
    }

    let cancelled = false;

    async function loadMatchScore() {
      setLoadingMatch(true);
      try {
        const response = await fetch(
          `${apiBaseUrl}/api/campaigns/${campaign.id}/match-score`,
          {
            credentials: "include",
          },
        );
        const payload = (await response.json()) as ApiResponse<MatchScore>;

        if (!response.ok || !payload.success || !payload.data) {
          throw new Error(payload.error ?? "Failed to load match score");
        }

        if (!cancelled) {
          setMatch(payload.data);
        }
      } catch (error) {
        if (!cancelled) {
          pushToast({
            type: "error",
            title: "Match score unavailable",
            message:
              error instanceof Error
                ? error.message
                : "Please refresh and try again.",
          });
        }
      } finally {
        if (!cancelled) {
          setLoadingMatch(false);
        }
      }
    }

    void loadMatchScore();

    return () => {
      cancelled = true;
    };
  }, [campaign.id, pushToast, showMatchScore, user?.role]);

  return (
    <article className="flex h-full flex-col justify-between border border-[#E5E5E5] bg-[#FAFAFA] p-6 text-[#0A0A0A] transition-colors hover:border-[#F59E0B] [border-radius:6px]">
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <span
            className={`inline-flex border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] [border-radius:6px] ${getStatusClass(segment)}`}
          >
            {segment}
          </span>

          <div className="flex gap-1.5">
            {showMatchScore && user?.role === "USER" ? (
              <MatchScorePill match={match} loading={loadingMatch} />
            ) : null}
            {campaign.platforms.slice(0, 3).map((platform) => (
              <span
                key={`${campaign.id}-${platform}`}
                className="inline-flex h-7 w-7 items-center justify-center border border-[#E5E5E5] bg-[#F5F5F5] text-[10px] font-medium text-[#0A0A0A] [border-radius:6px]"
                title={platform}
              >
                {normalizePlatform(platform)}
              </span>
            ))}
          </div>
        </div>

        <div>
          <h3 className="line-clamp-2 text-xl font-medium leading-tight">
            {campaign.title}
          </h3>
          {campaign.description ? (
            <p className="mt-3 line-clamp-2 text-sm leading-6 text-[#525252]">
              {campaign.description}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-between border-y border-[#E5E5E5] py-3 text-sm">
          <span className="text-[#525252]">By {founderName}</span>
          <span className="font-medium text-[#0A0A0A]">
            {getTimeLabel(campaign.endDate)}
          </span>
        </div>

        <BudgetBar
          totalBudget={campaign.budgetTotal}
          remainingBudget={campaign.budgetRemaining}
          size="sm"
        />

        {topMatches ? (
          <button
            type="button"
            onClick={onOpenShortlist}
            className="w-full border border-[#E5E5E5] bg-[#F5F5F5] p-3 text-left transition-colors hover:border-[#F59E0B] [border-radius:6px]"
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#525252]">
                Top Matches
              </p>
              <span className="text-xs font-medium text-[#0A0A0A]">View</span>
            </div>
            {topMatches.length > 0 ? (
              <div className="space-y-2">
                {topMatches.slice(0, 3).map((creator) => (
                  <div
                    key={creator.id}
                    className="flex items-center justify-between gap-3"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      {creator.avatar ? (
                        <img
                          src={creator.avatar}
                          alt=""
                          className="h-6 w-6 shrink-0 rounded-full object-cover"
                        />
                      ) : (
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#E5E5E5] text-[10px] font-medium">
                          {creator.name.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      <span className="truncate text-sm font-medium">
                        {creator.name}
                      </span>
                    </div>
                    <span
                      className={`shrink-0 border px-2 py-0.5 text-[11px] font-medium rounded-[999px] ${getMatchColor(creator.score)}`}
                    >
                      {creator.score}%
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[#525252]">No matches yet.</p>
            )}
          </button>
        ) : null}
      </div>

      <div className="mt-6 flex items-center justify-between gap-4 border-t border-[#E5E5E5] pt-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.08em] text-[#525252]">
            Creators
          </p>
          <p className="text-sm font-medium">{campaign.participants}</p>
        </div>

        <Link
          href={`/campaign/${campaign.id}`}
          className="inline-flex items-center justify-center border border-[#F59E0B] bg-[#F59E0B] px-4 py-2 text-xs font-medium uppercase text-[#0A0A0A] transition-colors hover:border-[#D97706] hover:bg-[#D97706] [border-radius:6px]"
        >
          View Campaign
        </Link>
      </div>
    </article>
  );
}
