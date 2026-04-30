"use client";

import { useEffect, useMemo, useState } from "react";

import type { ApiResponse, PostStatus, SocialPlatform } from "@virlo/shared";

import { Leaderboard } from "../../../components/Leaderboard";
import { Skeleton } from "../../../components/Skeleton";
import { withAuth } from "../../../components/auth/withAuth";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

type Tab = "overview" | "posts" | "earnings" | "leaderboard";

type CreatorStats = {
  totalEarned: number;
  activePosts: number;
  pendingPayout: number;
  rank: number | null;
};

type CreatorPost = {
  id: string;
  postUrl: string;
  platform: SocialPlatform;
  status: PostStatus;
  createdAt: string;
  campaign: {
    id: string;
    title: string;
  };
  engagementScore: number;
  earnings: number;
  payout: {
    id: string;
    amount: number;
    status: string;
    stellarTxHash: string | null;
    stellarTxUrl: string | null;
    createdAt: string;
  } | null;
};

const tabs: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "posts", label: "My Posts" },
  { id: "earnings", label: "Earnings" },
  { id: "leaderboard", label: "Leaderboard" },
];

function formatXlm(value: number) {
  return `${value.toFixed(2)} XLM`;
}

function platformLabel(platform: SocialPlatform) {
  if (platform === "TWITTER") return "X";
  if (platform === "LINKEDIN") return "in";
  return "IG";
}

function StatusBadge({ status }: { status: PostStatus | string }) {
  const className =
    status === "VERIFIED" || status === "COMPLETED"
      ? "border-[#F59E0B] text-[#F59E0B]"
      : status === "PENDING"
        ? "border-[#A3A3A3] text-[#525252]"
        : "border-[#525252] text-[#525252]";

  return (
    <span
      className={`inline-flex border px-2 py-1 text-[10px] font-medium uppercase [border-radius:6px] ${className}`}
    >
      {status}
    </span>
  );
}

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

function CreatorDashboardPage() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<CreatorStats | null>(null);
  const [posts, setPosts] = useState<CreatorPost[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [postsLoading, setPostsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadStats() {
      setStatsLoading(true);
      try {
        const response = await fetch(`${apiBaseUrl}/api/dashboard/creator`, {
          credentials: "include",
        });
        const payload = (await response.json()) as ApiResponse<CreatorStats>;
        if (!cancelled && payload.success && payload.data) {
          setStats(payload.data);
        }
      } catch {
        if (!cancelled) setError("Failed to load creator metrics");
      } finally {
        if (!cancelled) setStatsLoading(false);
      }
    }

    async function loadPosts() {
      setPostsLoading(true);
      try {
        const response = await fetch(
          `${apiBaseUrl}/api/posts?userId=me&payoutStatus=ALL`,
          {
            credentials: "include",
          },
        );
        const payload = (await response.json()) as ApiResponse<CreatorPost[]>;
        if (!cancelled && payload.success && payload.data) {
          setPosts(payload.data);
        }
      } catch {
        if (!cancelled) setError("Failed to load posts");
      } finally {
        if (!cancelled) setPostsLoading(false);
      }
    }

    void loadStats();
    void loadPosts();
    return () => {
      cancelled = true;
    };
  }, []);

  const payouts = useMemo(
    () => posts.filter((post) => Boolean(post.payout)).map((post) => post),
    [posts],
  );
  const leaderboardCampaignId = posts[0]?.campaign.id ?? null;

  return (
    <main className="min-h-screen bg-[#FAFAFA] px-5 py-10 text-[#0A0A0A]">
      <section className="mx-auto max-w-7xl space-y-6">
        <header className="border-b border-[#E5E5E5] pb-6">
          <p className="text-sm font-medium uppercase text-[#525252]">
            Creator Dashboard
          </p>
          <h1 className="mt-3 text-4xl font-medium">Performance and payouts</h1>
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
              label="Total Earned"
              value={formatXlm(stats?.totalEarned ?? 0)}
              loading={statsLoading}
            />
            <MetricCard
              label="Active Posts"
              value={String(stats?.activePosts ?? 0)}
              loading={statsLoading}
            />
            <MetricCard
              label="Pending Payout"
              value={formatXlm(stats?.pendingPayout ?? 0)}
              loading={statsLoading}
            />
            <MetricCard
              label="Rank"
              value={stats?.rank ? `#${stats.rank}` : "Unranked"}
              loading={statsLoading}
            />
          </div>
        ) : null}

        {activeTab === "posts" ? (
          <section className="overflow-hidden border border-[#E5E5E5] bg-[#FAFAFA] [border-radius:6px]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-215 text-left text-sm">
                <thead className="bg-[#F5F5F5] text-xs uppercase text-[#525252]">
                  <tr>
                    <th className="px-4 py-3">Platform</th>
                    <th className="px-4 py-3">Post URL</th>
                    <th className="px-4 py-3">Campaign</th>
                    <th className="px-4 py-3">Engagement Score</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Earnings</th>
                  </tr>
                </thead>
                <tbody>
                  {postsLoading
                    ? [0, 1, 2, 3].map((row) => (
                        <tr key={row} className="border-t border-[#E5E5E5]">
                          <td colSpan={6} className="px-4 py-4">
                            <Skeleton className="h-6 w-full" />
                          </td>
                        </tr>
                      ))
                    : posts.map((post) => (
                        <tr key={post.id} className="border-t border-[#E5E5E5]">
                          <td className="px-4 py-4">
                            <span className="grid h-8 w-8 place-items-center border border-[#E5E5E5] bg-[#F5F5F5] font-medium [border-radius:6px]">
                              {platformLabel(post.platform)}
                            </span>
                          </td>
                          <td className="max-w-65 px-4 py-4">
                            <a
                              href={post.postUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="truncate text-[#0A0A0A] underline decoration-[#A3A3A3]"
                            >
                              {post.postUrl}
                            </a>
                          </td>
                          <td className="px-4 py-4">{post.campaign.title}</td>
                          <td className="px-4 py-4">
                            {post.engagementScore.toFixed(1)}
                          </td>
                          <td className="px-4 py-4">
                            <StatusBadge status={post.status} />
                          </td>
                          <td className="px-4 py-4">
                            {formatXlm(post.earnings)}
                          </td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {activeTab === "earnings" ? (
          <section className="grid gap-3">
            {postsLoading ? (
              [0, 1, 2].map((row) => (
                <Skeleton key={row} className="h-20 w-full" />
              ))
            ) : payouts.length > 0 ? (
              payouts.map((post) => (
                <article
                  key={`${post.id}-payout`}
                  className="flex flex-col justify-between gap-4 border border-[#E5E5E5] bg-[#FAFAFA] p-5 [border-radius:6px] md:flex-row md:items-center"
                >
                  <div>
                    <p className="font-medium">{post.campaign.title}</p>
                    <p className="mt-1 text-sm text-[#525252]">
                      {post.payout
                        ? new Date(post.payout.createdAt).toLocaleDateString()
                        : new Date(post.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-4">
                    <span className="font-medium">
                      {formatXlm(post.payout?.amount ?? 0)}
                    </span>
                    <StatusBadge status={post.payout?.status ?? "PENDING"} />
                    {post.payout?.stellarTxHash ? (
                      <a
                        href={post.payout.stellarTxUrl ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-xs text-[#F59E0B]"
                      >
                        {post.payout.stellarTxHash.slice(0, 10)}...
                      </a>
                    ) : (
                      <span className="text-sm text-[#525252]">
                        No transaction yet
                      </span>
                    )}
                  </div>
                </article>
              ))
            ) : (
              <p className="border border-[#E5E5E5] p-8 text-center text-[#525252] [border-radius:6px]">
                No payout history yet.
              </p>
            )}
          </section>
        ) : null}

        {activeTab === "leaderboard" ? (
          <section className="border border-[#E5E5E5] bg-[#0A0A0A] p-5 [border-radius:6px]">
            {leaderboardCampaignId ? (
              <Leaderboard campaignId={leaderboardCampaignId} />
            ) : (
              <p className="text-sm text-[#A3A3A3]">
                Submit a post to appear on a campaign leaderboard.
              </p>
            )}
          </section>
        ) : null}
      </section>
    </main>
  );
}

export default withAuth(CreatorDashboardPage, { role: "USER" });
