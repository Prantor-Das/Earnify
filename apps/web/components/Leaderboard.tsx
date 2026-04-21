"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { LeaderboardEntry } from "@earnify/shared";
import { io, type Socket } from "socket.io-client";

import { Badge, resolveBadges } from "./Badge";
import { EmptyState } from "./EmptyState";
import { Skeleton } from "./Skeleton";

type LeaderboardProps = {
  campaignId: string;
  initialEntries?: LeaderboardEntry[];
  onConnectionChange?: (isConnected: boolean) => void;
  isLoading?: boolean;
};

type RankMovement = "up" | "down" | "same";

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
  if (previousRank === undefined || previousRank === currentRank) {
    return "same";
  }

  return previousRank > currentRank ? "up" : "down";
}

function getPodiumRowStyle(rank: number) {
  if (rank === 1) {
    return {
      backgroundColor: "color-mix(in srgb, var(--color-accent) 16%, var(--color-surface))",
      borderColor: "color-mix(in srgb, var(--color-accent) 38%, var(--color-border))"
    };
  }

  if (rank === 2) {
    return {
      backgroundColor: "color-mix(in srgb, var(--color-muted) 12%, var(--color-surface))",
      borderColor: "color-mix(in srgb, var(--color-muted) 30%, var(--color-border))"
    };
  }

  if (rank === 3) {
    return {
      backgroundColor: "color-mix(in srgb, var(--color-primary) 12%, var(--color-surface))",
      borderColor: "color-mix(in srgb, var(--color-primary) 30%, var(--color-border))"
    };
  }

  return {
    backgroundColor: "color-mix(in srgb, var(--color-background) 55%, var(--color-surface))",
    borderColor: "var(--color-border)"
  };
}

function formatScore(score: number) {
  return score.toFixed(2);
}

export function Leaderboard({ campaignId, initialEntries = [], onConnectionChange, isLoading = false }: LeaderboardProps) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>(initialEntries);
  const [transientMovementByUserId, setTransientMovementByUserId] = useState<Record<string, RankMovement>>({});
  const socketRef = useRef<Socket | null>(null);
  const movementTimerRef = useRef<number | null>(null);
  const entriesRef = useRef<LeaderboardEntry[]>(initialEntries);

  useEffect(() => {
    setEntries(initialEntries);
  }, [initialEntries]);

  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  useEffect(() => {
    const socket = io(getApiBaseUrl(), {
      transports: ["websocket"],
      withCredentials: true
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      onConnectionChange?.(true);
      socket.emit("join-campaign", { campaignId });
    });

    socket.on("disconnect", () => {
      onConnectionChange?.(false);
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

      onConnectionChange?.(false);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [campaignId, onConnectionChange]);

  const hasEntries = useMemo(() => entries.length > 0, [entries]);

  if (isLoading) {
    return (
      <ul className="space-y-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <li key={`leaderboard-skeleton-${index}`} className="rounded-md border border-border p-3 sm:p-4">
            <div className="grid grid-cols-[auto,1fr,auto] items-center gap-3 sm:grid-cols-[auto,1.4fr,0.8fr,auto] sm:gap-4">
              <Skeleton className="h-6 w-8" />
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
              <div className="justify-self-end space-y-2">
                <Skeleton className="ml-auto h-4 w-16" />
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

  return (
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

        return (
          <li
            key={entry.userId}
            className={`grid grid-cols-[auto,1fr,auto] items-center gap-3 rounded-md border p-3 transition-transform duration-300 ease-out sm:grid-cols-[auto,1.4fr,0.8fr,auto] sm:gap-4 sm:p-4 ${transformClass}`}
            style={getPodiumRowStyle(entry.rank)}
          >
            <div className="flex items-center gap-2">
              <span className="w-8 text-center text-base font-semibold text-secondary">#{entry.rank}</span>
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <img
                  src={entry.userAvatar ?? "https://placehold.co/64x64/e2e8f0/334155?text=U"}
                  alt={`${entry.userName} avatar`}
                  className="h-9 w-9 rounded-full border border-border object-cover sm:h-10 sm:w-10"
                />

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-secondary sm:text-base">{entry.userName}</p>
                    {resolveBadges({
                      rank: entry.rank,
                      verifiedPostCount: entry.postCount,
                      maxPostScore: entry.score
                    })
                      .slice(0, 2)
                      .map((badge) => (
                        <Badge key={`${entry.userId}-${badge}`} badge={badge} compact />
                      ))}
                  </div>
                  <p className="text-xs text-muted">{entry.postCount} posts</p>
                </div>
              </div>
            </div>

            <div className="justify-self-end text-right">
              <p className="text-sm font-semibold text-secondary sm:text-base">{formatScore(entry.score)}</p>
              <p className="text-xs text-muted">points</p>
            </div>

            <div className="justify-self-end text-sm font-semibold" style={{ color: trendColor }}>
              {trendSymbol}
            </div>
          </li>
        );
      })}
    </ul>
  );
}