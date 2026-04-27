"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { LeaderboardEntry, SocialPlatform } from "@earnify/shared";
import { io, type Socket } from "socket.io-client";

import { Badge, resolveBadges } from "./Badge";
import { EmptyState } from "./EmptyState";
import { Skeleton } from "./Skeleton";

type LeaderboardProps = {
  campaignId: string;
  initialEntries?: LeaderboardEntry[];
  isLoading?: boolean;
};

type RankMovement = "up" | "down" | "same";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getApiBaseUrl() {
  const configuredUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

  try {
    const parsed = new URL(configuredUrl);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return "http://localhost:4000";
  }
}

function getMovementFromRanks(previousRank: number | undefined, currentRank: number): RankMovement {
  if (previousRank === undefined || previousRank === currentRank) return "same";
  return previousRank > currentRank ? "up" : "down";
}

function getPodiumRowStyle(rank: number) {
  if (rank === 1) {
    return {
      className: "border-l-2 border-l-[#F59E0B] bg-[#16120a]/80 border-y border-y-[var(--color-border)]/30 border-r border-r-[var(--color-border)]/30"
    };
  }
  if (rank === 2) {
    return {
      className: "border-l-2 border-l-zinc-400 bg-zinc-900/65 border-y border-y-[var(--color-border)]/30 border-r border-r-[var(--color-border)]/30"
    };
  }
  if (rank === 3) {
    return {
      className: "border-l-2 border-l-zinc-500 bg-zinc-900/65 border-y border-y-[var(--color-border)]/30 border-r border-r-[var(--color-border)]/30"
    };
  }
  return {
    className: "bg-[#0D0F14]/40 border border-[var(--color-border)]/30"
  };
}

function formatScore(score: number) {
  return score.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function formatMetric(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function formatEarnings(value: number) {
  return `${value.toFixed(2)} XLM`;
}

function formatLastUpdated(iso: string | null) {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(iso));
  } catch {
    return null;
  }
}

// Compact platform badge (no label, just the short code)
function PlatformBadge({ platform }: { platform: SocialPlatform }) {
  const labels: Record<SocialPlatform, string> = {
    TWITTER: "X",
    LINKEDIN: "in",
    INSTAGRAM: "IG"
  };
  const fullNames: Record<SocialPlatform, string> = {
    TWITTER: "Twitter / X",
    LINKEDIN: "LinkedIn",
    INSTAGRAM: "Instagram"
  };

  return (
    <span
      aria-label={fullNames[platform]}
      title={fullNames[platform]}
      className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-surface)]/50 border border-[var(--color-border)]/30 text-[10px] font-bold text-white shadow-sm"
    >
      {labels[platform]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Leaderboard({ campaignId, initialEntries = [], isLoading: externalLoading = false }: LeaderboardProps) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>(initialEntries);
  const [fetchLoading, setFetchLoading] = useState(initialEntries.length === 0);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [transientMovementByUserId, setTransientMovementByUserId] = useState<Record<string, RankMovement>>({});
  const socketRef = useRef<Socket | null>(null);
  const movementTimerRef = useRef<number | null>(null);
  const entriesRef = useRef<LeaderboardEntry[]>(initialEntries);

  const isLoading = externalLoading || fetchLoading;

  // Sync ref so the socket handler always sees the latest entries
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  // Fetch leaderboard from API
  const fetchLeaderboard = useCallback(async () => {
    try {
      const apiBase = getApiBaseUrl();
      const res = await fetch(`${apiBase}/api/campaigns/${campaignId}/leaderboard`, {
        credentials: "include"
      });
      if (!res.ok) return;
      const json = (await res.json()) as { success: boolean; data?: LeaderboardEntry[] };
      if (json.success && Array.isArray(json.data)) {
        setEntries(json.data);
        // Use the most recent lastUpdatedAt from the entries
        const latest = json.data.reduce<string | null>((acc, e) => {
          if (!e.lastUpdatedAt) return acc;
          if (!acc) return e.lastUpdatedAt;
          return e.lastUpdatedAt > acc ? e.lastUpdatedAt : acc;
        }, null);
        setLastUpdatedAt(latest);
      }
    } catch {
      // silently ignore fetch errors — stale data is better than a crash
    } finally {
      setFetchLoading(false);
    }
  }, [campaignId]);

  // Initial fetch
  useEffect(() => {
    void fetchLeaderboard();
  }, [fetchLeaderboard]);

  // Sync when parent passes new initialEntries
  useEffect(() => {
    if (initialEntries.length > 0) {
      setEntries(initialEntries);
      setFetchLoading(false);
    }
  }, [initialEntries]);

  // WebSocket subscription
  useEffect(() => {
    const socket = io(getApiBaseUrl(), {
      transports: ["websocket"],
      withCredentials: true
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("join-campaign", { campaignId });
    });

    socket.on(
      "leaderboard-update",
      (payload: { campaignId?: string; leaderboard?: LeaderboardEntry[] } | undefined) => {
        if (!payload?.campaignId || payload.campaignId !== campaignId || !Array.isArray(payload.leaderboard)) {
          return;
        }

        const previousRanks = new Map(entriesRef.current.map((entry) => [entry.userId, entry.rank]));

        const movementByUserId: Record<string, RankMovement> = {};
        for (const entry of payload.leaderboard) {
          movementByUserId[entry.userId] = getMovementFromRanks(previousRanks.get(entry.userId), entry.rank);
        }

        setTransientMovementByUserId(movementByUserId);
        setEntries(payload.leaderboard);

        // Update last-updated timestamp
        const latest = payload.leaderboard.reduce<string | null>((acc, e) => {
          if (!e.lastUpdatedAt) return acc;
          if (!acc) return e.lastUpdatedAt;
          return e.lastUpdatedAt > acc ? e.lastUpdatedAt : acc;
        }, null);
        setLastUpdatedAt(latest ?? new Date().toISOString());

        if (movementTimerRef.current) {
          window.clearTimeout(movementTimerRef.current);
        }
        movementTimerRef.current = window.setTimeout(() => {
          setTransientMovementByUserId({});
        }, 360);
      }
    );

    return () => {
      if (movementTimerRef.current) {
        window.clearTimeout(movementTimerRef.current);
      }
      socket.disconnect();
      socketRef.current = null;
    };
  }, [campaignId]);

  const hasEntries = useMemo(() => entries.length > 0, [entries]);

  if (isLoading) {
    return (
      <ul className="space-y-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <li key={`leaderboard-skeleton-${index}`} className="rounded-sm border border-[var(--color-border)]/30 bg-[#0D0F14]/50 p-2.5 sm:p-3">
            <div className="grid grid-cols-[auto,1fr,auto] items-center gap-2.5 sm:grid-cols-[auto,1.2fr,0.9fr,auto] sm:gap-3">
              <Skeleton className="h-5 w-8" />
              <div className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
              <div className="justify-self-end space-y-2">
                <Skeleton className="ml-auto h-3.5 w-14" />
                <Skeleton className="ml-auto h-3 w-10" />
              </div>
              <Skeleton className="h-4 w-4" />
            </div>
          </li>
        ))}
      </ul>
    );
  }

  if (!hasEntries) {
    return (
      <EmptyState
        variant="leaderboard"
        title="No posts in leaderboard"
        description="Once creators submit and verify posts, rankings will appear here."
      />
    );
  }

  const formattedLastUpdated = formatLastUpdated(lastUpdatedAt);

  return (
    <div className="space-y-3">
      {formattedLastUpdated && (
        <p className="text-right text-xs text-muted">
          Last updated: <time dateTime={lastUpdatedAt ?? undefined}>{formattedLastUpdated}</time>
        </p>
      )}

      <ul className="space-y-3">
        {entries.map((entry) => {
          const movement = transientMovementByUserId[entry.userId] ?? "same";
          const transformClass =
            movement === "up" ? "-translate-y-1.5" : movement === "down" ? "translate-y-1.5" : "translate-y-0";
          const trendSymbol = entry.change === "up" ? "↑" : entry.change === "down" ? "↓" : "→";
          const trendColor =
            entry.change === "up"
              ? "var(--color-success)"
              : entry.change === "down"
                ? "var(--color-danger)"
                : "var(--color-muted)";

          const podiumStyle = getPodiumRowStyle(entry.rank);

          return (
            <li
              key={entry.userId}
              className={`rounded-sm p-3 transition-transform duration-300 ease-out sm:p-4 ${transformClass} ${podiumStyle.className}`}
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex min-w-11 items-center justify-center border border-[var(--color-border)] bg-black/40 px-2 py-1 text-xs font-bold text-[var(--color-primary)]">
                      #{entry.rank}
                    </span>
                    <img
                      src={entry.userAvatar ?? "https://placehold.co/64x64/e2e8f0/334155?text=U"}
                      alt={`${entry.userName} avatar`}
                      className="h-9 w-9 rounded-full border border-[var(--color-border)]/40 object-cover"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-base font-semibold text-white">{entry.userName}</p>
                        {resolveBadges({
                          rank: entry.rank,
                          verifiedPostCount: entry.postCount,
                          maxPostScore: entry.score
                        })
                          .slice(0, 1)
                          .map((badge) => (
                            <Badge key={`${entry.userId}-${badge}`} badge={badge} compact />
                          ))}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5">
                        {entry.platforms.length > 0
                          ? entry.platforms.map((platform) => (
                              <PlatformBadge key={platform} platform={platform} />
                            ))
                          : null}
                        <span className="text-xs text-zinc-500">{entry.postCount} posts</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                    <div className="border border-[var(--color-border)]/60 bg-black/35 px-2.5 py-2">
                      <p className="text-[10px] uppercase tracking-[0.08em] text-zinc-500">Views</p>
                      <p className="mt-0.5 font-semibold text-zinc-100">{formatMetric(entry.xStats?.views ?? 0)}</p>
                    </div>
                    <div className="border border-[var(--color-border)]/60 bg-black/35 px-2.5 py-2">
                      <p className="text-[10px] uppercase tracking-[0.08em] text-zinc-500">Likes</p>
                      <p className="mt-0.5 font-semibold text-zinc-100">{formatMetric(entry.xStats?.likes ?? 0)}</p>
                    </div>
                    <div className="border border-[var(--color-border)]/60 bg-black/35 px-2.5 py-2">
                      <p className="text-[10px] uppercase tracking-[0.08em] text-zinc-500">Replies</p>
                      <p className="mt-0.5 font-semibold text-zinc-100">{formatMetric(entry.xStats?.replies ?? 0)}</p>
                    </div>
                    <div className="border border-[var(--color-border)]/60 bg-black/35 px-2.5 py-2">
                      <p className="text-[10px] uppercase tracking-[0.08em] text-zinc-500">Reposts</p>
                      <p className="mt-0.5 font-semibold text-zinc-100">{formatMetric(entry.xStats?.reposts ?? 0)}</p>
                    </div>
                  </div>
                </div>

                <div className="w-full border border-[var(--color-border)]/70 bg-black/45 px-4 py-3 text-left lg:w-[210px] lg:text-right">
                  <p className="text-[10px] uppercase tracking-[0.09em] text-zinc-500">Score</p>
                  <p className="mt-1 text-2xl font-bold text-[var(--color-primary)]">{formatScore(entry.score)}</p>
                  <div className="mt-1 flex items-center gap-2 text-xs text-zinc-400 lg:justify-end">
                    <span>{formatEarnings(entry.estimatedEarnings)}</span>
                    <span className="font-semibold" style={{ color: trendColor }}>
                      {trendSymbol}
                    </span>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
