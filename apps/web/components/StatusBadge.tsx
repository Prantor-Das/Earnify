import type { CampaignStatus } from "@earnify/shared";

const statusLabelMap: Record<CampaignStatus, string> = {
  ACTIVE: "Active",
  PAUSED: "Paused",
  ENDED: "Ended"
};

const statusStyleMap: Record<CampaignStatus, { text: string; background: string }> = {
  ACTIVE: {
    text: "var(--color-success)",
    background: "color-mix(in srgb, var(--color-success) 16%, var(--color-surface))"
  },
  PAUSED: {
    text: "var(--color-accent)",
    background: "color-mix(in srgb, var(--color-accent) 20%, var(--color-surface))"
  },
  ENDED: {
    text: "var(--color-muted)",
    background: "color-mix(in srgb, var(--color-muted) 20%, var(--color-surface))"
  }
};

export function StatusBadge({ status }: { status: CampaignStatus }) {
  const styles = statusStyleMap[status];

  return (
    <span
      className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em]"
      style={{ color: styles.text, backgroundColor: styles.background }}
    >
      {statusLabelMap[status]}
    </span>
  );
}
