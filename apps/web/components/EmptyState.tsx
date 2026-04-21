type EmptyStateVariant = "campaigns" | "leaderboard" | "payouts";

type EmptyStateProps = {
  title: string;
  description: string;
  variant: EmptyStateVariant;
};

function EmptyState({ title, description, variant }: EmptyStateProps) {
  return (
    <div className="rounded-lg border border-border bg-surface p-6 text-center">
      <div className="mx-auto w-full max-w-[280px]">
        <svg viewBox="0 0 260 140" role="img" aria-label={title} className="h-auto w-full">
          <defs>
            <linearGradient id="empty-gradient" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.35" />
              <stop offset="100%" stopColor="var(--color-secondary)" stopOpacity="0.2" />
            </linearGradient>
          </defs>
          <rect x="10" y="20" width="240" height="100" rx="16" fill="url(#empty-gradient)" />

          {variant === "campaigns" ? (
            <>
              <rect x="35" y="45" width="90" height="12" rx="6" fill="var(--color-surface)" fillOpacity="0.7" />
              <rect x="35" y="65" width="130" height="10" rx="5" fill="var(--color-surface)" fillOpacity="0.5" />
              <circle cx="200" cy="66" r="20" fill="var(--color-accent)" fillOpacity="0.7" />
            </>
          ) : null}

          {variant === "leaderboard" ? (
            <>
              <circle cx="52" cy="58" r="12" fill="var(--color-surface)" fillOpacity="0.75" />
              <rect x="70" y="52" width="120" height="10" rx="5" fill="var(--color-surface)" fillOpacity="0.65" />
              <rect x="35" y="78" width="175" height="10" rx="5" fill="var(--color-surface)" fillOpacity="0.45" />
            </>
          ) : null}

          {variant === "payouts" ? (
            <>
              <rect x="35" y="48" width="140" height="14" rx="7" fill="var(--color-surface)" fillOpacity="0.7" />
              <rect x="35" y="72" width="80" height="10" rx="5" fill="var(--color-surface)" fillOpacity="0.55" />
              <rect x="185" y="46" width="42" height="42" rx="10" fill="var(--color-success)" fillOpacity="0.55" />
            </>
          ) : null}
        </svg>
      </div>
      <p className="mt-4 text-base font-semibold text-secondary">{title}</p>
      <p className="mt-1 text-sm text-muted">{description}</p>
    </div>
  );
}

export { EmptyState };