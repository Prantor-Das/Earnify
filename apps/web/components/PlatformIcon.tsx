import type { SocialPlatform } from "@earnify/shared";

const iconLabel: Record<SocialPlatform, { short: string; full: string }> = {
  TWITTER: { short: "X", full: "Twitter / X" },
  LINKEDIN: { short: "in", full: "LinkedIn" },
  INSTAGRAM: { short: "IG", full: "Instagram" }
};

export function PlatformIcon({ platform }: { platform: SocialPlatform }) {
  const icon = iconLabel[platform];

  return (
    <span className="inline-flex items-center gap-2 text-sm text-secondary">
      <span
        aria-hidden
        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border text-xs font-bold"
        style={{ backgroundColor: "color-mix(in srgb, var(--color-secondary) 10%, var(--color-surface))" }}
      >
        {icon.short}
      </span>
      {icon.full}
    </span>
  );
}
