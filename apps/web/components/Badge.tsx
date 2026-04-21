type EarnifyBadgeType = "Top Performer" | "Verified Creator" | "Viral Post" | "5-Campaign Pro" | "Early Adopter";

type BadgeSignals = {
  rank?: number;
  verifiedPostCount?: number;
  maxPostScore?: number;
  campaignCount?: number;
  earlyAdopterRank?: number;
};

type BadgeProps = {
  badge: EarnifyBadgeType;
  compact?: boolean;
};

const badgeMeta: Record<
  EarnifyBadgeType,
  {
    label: string;
    icon: string;
    textColor: string;
    background: string;
    borderColor: string;
  }
> = {
  "Top Performer": {
    label: "Top Performer",
    icon: "🔥",
    textColor: "var(--color-accent)",
    background: "color-mix(in srgb, var(--color-accent) 18%, var(--color-surface))",
    borderColor: "color-mix(in srgb, var(--color-accent) 46%, var(--color-border))"
  },
  "Verified Creator": {
    label: "Verified Creator",
    icon: "✔",
    textColor: "var(--color-success)",
    background: "color-mix(in srgb, var(--color-success) 16%, var(--color-surface))",
    borderColor: "color-mix(in srgb, var(--color-success) 40%, var(--color-border))"
  },
  "Viral Post": {
    label: "Viral Post",
    icon: "🚀",
    textColor: "var(--color-secondary)",
    background: "color-mix(in srgb, var(--color-secondary) 12%, var(--color-surface))",
    borderColor: "color-mix(in srgb, var(--color-secondary) 38%, var(--color-border))"
  },
  "5-Campaign Pro": {
    label: "5-Campaign Pro",
    icon: "🏆",
    textColor: "var(--color-primary)",
    background: "color-mix(in srgb, var(--color-primary) 14%, var(--color-surface))",
    borderColor: "color-mix(in srgb, var(--color-primary) 36%, var(--color-border))"
  },
  "Early Adopter": {
    label: "Early Adopter",
    icon: "⭐",
    textColor: "var(--color-muted)",
    background: "color-mix(in srgb, var(--color-muted) 12%, var(--color-surface))",
    borderColor: "color-mix(in srgb, var(--color-muted) 36%, var(--color-border))"
  }
};

function resolveBadges(signals: BadgeSignals): EarnifyBadgeType[] {
  const badges: EarnifyBadgeType[] = [];

  if (signals.rank === 1) {
    badges.push("Top Performer");
  }

  if ((signals.verifiedPostCount ?? 0) >= 1) {
    badges.push("Verified Creator");
  }

  if ((signals.maxPostScore ?? 0) > 1000) {
    badges.push("Viral Post");
  }

  if ((signals.campaignCount ?? 0) >= 5) {
    badges.push("5-Campaign Pro");
  }

  if ((signals.earlyAdopterRank ?? Number.POSITIVE_INFINITY) <= 50) {
    badges.push("Early Adopter");
  }

  return badges;
}

function Badge({ badge, compact = false }: BadgeProps) {
  const meta = badgeMeta[badge];

  return (
    <span
      title={meta.label}
      className={`inline-flex items-center gap-1 rounded-full border font-semibold ${compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs"}`}
      style={{
        color: meta.textColor,
        backgroundColor: meta.background,
        borderColor: meta.borderColor
      }}
    >
      <span aria-hidden>{meta.icon}</span>
      {!compact ? <span>{meta.label}</span> : null}
    </span>
  );
}

export { Badge, resolveBadges };
export type { EarnifyBadgeType };