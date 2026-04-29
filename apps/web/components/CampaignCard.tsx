import Link from "next/link";

import type { CampaignStatus } from "@earnify/shared";

import { BudgetBar } from "./BudgetBar";
import { StatusBadge } from "./StatusBadge";

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
};

function normalizePlatform(platform: string) {
  const key = platform.toUpperCase();
  if (key === "TWITTER") return "X";
  if (key === "LINKEDIN") return "IN";
  if (key === "INSTAGRAM") return "IG";
  if (key === "X") return "X";
  return key.slice(0, 2);
}

function getTimeLabel(endDate?: string | null) {
  if (!endDate) {
    return "No end date";
  }

  const end = new Date(endDate);
  if (Number.isNaN(end.getTime())) {
    return "No end date";
  }

  const now = Date.now();
  const diff = end.getTime() - now;

  if (diff <= 0) {
    return "Ended";
  }

  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  return days === 1 ? "1 day left" : `${days} days left`;
}

export function CampaignCard({ campaign }: CampaignCardProps) {
  const founderName = campaign.founder?.name?.trim() || "Founder";

  return (
    <article className="surface-card group relative flex h-full flex-col justify-between gap-6 rounded-sm p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-[var(--color-primary)]/40">
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-3">
            {campaign.status ? <StatusBadge status={campaign.status} /> : null}
            <h3 className="text-xl font-semibold text-[#fafafa] leading-tight line-clamp-2">
              {campaign.title}
            </h3>
          </div>

          <div className="flex gap-1.5">
            {campaign.platforms.slice(0, 3).map((platform) => (
              <span
                key={`${campaign.id}-${platform}`}
                className="inline-flex h-7 w-7 items-center justify-center border border-[var(--color-border)] bg-black/40 text-[10px] font-semibold text-zinc-200"
                title={platform}
              >
                {normalizePlatform(platform)}
              </span>
            ))}
          </div>
        </div>

        {campaign.description ? (
          <p className="line-clamp-2 text-sm text-zinc-400">
            {campaign.description}
          </p>
        ) : null}

        <div className="flex items-center justify-between border-y border-[var(--color-border)] py-3">
          <p className="text-sm text-zinc-300">
            By{" "}
            <span className="font-semibold text-zinc-100">{founderName}</span>
          </p>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500">
            {getTimeLabel(campaign.endDate)}
          </p>
        </div>

        <BudgetBar
          totalBudget={campaign.budgetTotal}
          remainingBudget={campaign.budgetRemaining}
          size="sm"
        />
      </div>

      <div className="mt-2 flex items-center justify-between gap-4 border-t border-[var(--color-border)] pt-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.08em] text-zinc-500">
            Participants
          </p>
          <p className="text-sm font-semibold text-zinc-100">
            {campaign.participants}
          </p>
        </div>

        <Link
          href={`/campaign/${campaign.id}`}
          className="inline-flex items-center justify-center border border-[var(--color-primary)] bg-[var(--color-primary)] px-4 py-2 text-xs font-bold uppercase tracking-[0.08em] text-black transition-colors hover:bg-[var(--color-accent)]"
        >
          View Campaign
        </Link>
      </div>
    </article>
  );
}
