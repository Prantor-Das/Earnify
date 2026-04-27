import type { CampaignStatus } from "@earnify/shared";

const statusLabelMap: Record<CampaignStatus, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  PAUSED: "Paused",
  COMPLETED: "Completed",
  ENDED: "Ended"
};

const statusStyleMap: Record<CampaignStatus, { text: string; background: string; glow: string }> = {
  DRAFT: {
    text: "text-zinc-300",
    background: "bg-zinc-700/20",
    glow: ""
  },
  ACTIVE: {
    text: "text-[var(--color-primary)]",
    background: "bg-[var(--color-primary)]/15",
    glow: "shadow-[0_0_16px_-6px_rgba(245,158,11,0.65)]"
  },
  PAUSED: {
    text: "text-zinc-200",
    background: "bg-zinc-700/25",
    glow: ""
  },
  COMPLETED: {
    text: "text-zinc-100",
    background: "bg-zinc-700/35",
    glow: ""
  },
  ENDED: {
    text: "text-zinc-500",
    background: "bg-zinc-800/70",
    glow: ""
  }
};

export function StatusBadge({ status }: { status: CampaignStatus }) {
  const styles = statusStyleMap[status];

  return (
    <span
      className={`inline-flex items-center rounded-sm border border-[var(--color-border)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${styles.text} ${styles.background} ${styles.glow}`}
    >
      {status === "ACTIVE" && <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-[var(--color-primary)] animate-pulse"></span>}
      {statusLabelMap[status]}
    </span>
  );
}
