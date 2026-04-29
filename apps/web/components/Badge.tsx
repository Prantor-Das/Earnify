type EarnifyBadgeType =
  | "Top Performer"
  | "Verified Creator"
  | "Viral Post"
  | "5-Campaign Pro"
  | "Early Adopter";

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
    glowColor: string;
  }
> = {
  "Top Performer": {
    label: "Top Performer",
    icon: "TP",
    textColor: "text-[var(--color-primary)]",
    background:
      "bg-[var(--color-primary)]/14 border border-[var(--color-primary)]/30",
    glowColor: "shadow-[0_0_14px_-8px_rgba(245,158,11,0.9)]",
  },
  "Verified Creator": {
    label: "Verified Creator",
    icon: "VC",
    textColor: "text-zinc-100",
    background: "bg-zinc-700/30 border border-zinc-600",
    glowColor: "",
  },
  "Viral Post": {
    label: "Viral Post",
    icon: "VP",
    textColor: "text-zinc-100",
    background: "bg-zinc-700/30 border border-zinc-600",
    glowColor: "",
  },
  "5-Campaign Pro": {
    label: "5-Campaign Pro",
    icon: "5P",
    textColor: "text-zinc-100",
    background: "bg-zinc-700/30 border border-zinc-600",
    glowColor: "",
  },
  "Early Adopter": {
    label: "Early Adopter",
    icon: "EA",
    textColor: "text-zinc-300",
    background: "bg-zinc-800/35 border border-zinc-700",
    glowColor: "",
  },
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
      className={`inline-flex items-center gap-1.5 font-bold ${meta.background} ${meta.textColor} ${meta.glowColor} ${
        compact ? "px-2 py-0.5 text-[10px]" : "px-3 py-1.5 text-xs"
      }`}
    >
      <span aria-hidden>{meta.icon}</span>
      {!compact ? <span>{meta.label}</span> : null}
    </span>
  );
}

export { Badge, resolveBadges };
export type { EarnifyBadgeType };
