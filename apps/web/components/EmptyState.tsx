type EmptyStateVariant = "campaigns" | "leaderboard" | "payouts";

type EmptyStateProps = {
  title: string;
  description: string;
  variant: EmptyStateVariant;
};

function EmptyState({ title, description, variant }: EmptyStateProps) {
  return (
    <div className="surface-card rounded-sm p-10 flex flex-col items-center justify-center text-center">
      <div className="mx-auto w-full max-w-[240px] opacity-80 mix-blend-screen">
        <svg viewBox="0 0 260 140" role="img" aria-label={title} className="h-auto w-full">
          <defs>
            <linearGradient id="empty-gradient" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.1" />
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
          <rect x="10" y="20" width="240" height="100" rx="20" fill="url(#empty-gradient)" stroke="var(--color-border)" strokeWidth="1" />

          {variant === "campaigns" ? (
            <g filter="url(#glow)">
              <rect x="35" y="45" width="90" height="12" rx="6" fill="var(--color-surface)" fillOpacity="0.8" />
              <rect x="35" y="65" width="130" height="10" rx="5" fill="var(--color-surface)" fillOpacity="0.6" />
              <circle cx="200" cy="66" r="20" fill="var(--color-primary)" fillOpacity="0.6" />
            </g>
          ) : null}

          {variant === "leaderboard" ? (
            <g filter="url(#glow)">
              <circle cx="52" cy="58" r="14" fill="var(--color-surface)" fillOpacity="0.8" />
              <rect x="75" y="53" width="115" height="10" rx="5" fill="var(--color-surface)" fillOpacity="0.7" />
              <rect x="35" y="82" width="175" height="10" rx="5" fill="var(--color-surface)" fillOpacity="0.5" />
            </g>
          ) : null}

          {variant === "payouts" ? (
            <g filter="url(#glow)">
              <rect x="35" y="48" width="140" height="14" rx="7" fill="var(--color-surface)" fillOpacity="0.8" />
              <rect x="35" y="72" width="80" height="10" rx="5" fill="var(--color-surface)" fillOpacity="0.6" />
              <rect x="185" y="46" width="42" height="42" rx="12" fill="var(--color-success)" fillOpacity="0.6" />
            </g>
          ) : null}
        </svg>
      </div>
      <p className="mt-6 text-xl font-bold text-[#f5f5f5] tracking-wide">{title}</p>
      <p className="mt-2 text-sm text-[var(--color-muted)] max-w-sm">{description}</p>
    </div>
  );
}

export { EmptyState };
