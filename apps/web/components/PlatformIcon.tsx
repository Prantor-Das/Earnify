import type { SocialPlatform } from "@earnify/shared";

const iconLabel: Record<SocialPlatform, { short: string; full: string }> = {
  TWITTER: { short: "X", full: "Twitter / X" },
  LINKEDIN: { short: "in", full: "LinkedIn" },
  INSTAGRAM: { short: "IG", full: "Instagram" }
};

export function PlatformIcon({ platform }: { platform: SocialPlatform }) {
  const icon = iconLabel[platform];

  return (
    <span className="inline-flex items-center gap-2 text-sm font-semibold text-white">
      <span
        aria-hidden
        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--color-border)]/30 bg-[var(--color-surface)]/50 backdrop-blur-sm text-xs font-bold shadow-[0_0_10px_-3px_rgba(255,255,255,0.1)]"
      >
        {icon.short}
      </span>
      {icon.full}
    </span>
  );
}
