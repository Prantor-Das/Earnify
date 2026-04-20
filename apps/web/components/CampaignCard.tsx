import type { CampaignStatus } from "@earnify/shared";

import { BudgetBar } from "./BudgetBar";
import { StatusBadge } from "./StatusBadge";

type CampaignCardProps = {
  id: string;
  title: string;
  description: string;
  totalBudget: number;
  remainingBudget: number;
  postCount: number;
  status: CampaignStatus;
};

export function CampaignCard({
  id,
  title,
  description,
  totalBudget,
  remainingBudget,
  postCount,
  status
}: CampaignCardProps) {
  return (
    <article
      className="flex h-full flex-col gap-5 rounded-lg border border-border p-5"
      style={{
        backgroundColor: "color-mix(in srgb, var(--color-surface) 94%, white)",
        boxShadow: "0 20px 45px color-mix(in srgb, var(--color-secondary) 10%, transparent)"
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-semibold text-secondary">{title}</h3>
        <StatusBadge status={status} />
      </div>

      <p className="text-sm leading-6 text-muted">{description}</p>

      <BudgetBar totalBudget={totalBudget} remainingBudget={remainingBudget} size="sm" />

      <div className="mt-auto flex items-center justify-between gap-3">
        <p className="text-sm text-muted">
          <span className="font-semibold text-secondary">{postCount}</span> posts
        </p>

        <a
          href={`/campaign/${id}`}
          className="inline-flex items-center rounded-md border border-border px-4 py-2 text-sm font-semibold text-secondary transition-transform duration-150 ease-out hover:-translate-y-0.5"
          style={{
            background: "linear-gradient(120deg, color-mix(in srgb, var(--color-primary) 18%, white), var(--color-surface))"
          }}
        >
          Join Campaign
        </a>
      </div>
    </article>
  );
}
