type BudgetBarProps = {
  totalBudget: number;
  remainingBudget: number;
  size?: "sm" | "md";
};

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

export function BudgetBar({ totalBudget, remainingBudget, size = "md" }: BudgetBarProps) {
  const safeTotal = totalBudget > 0 ? totalBudget : 1;
  const spentPercent = clampPercent(((safeTotal - remainingBudget) / safeTotal) * 100);
  const barHeight = size === "sm" ? "0.45rem" : "0.65rem";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-secondary">{remainingBudget.toFixed(2)} XLM left</span>
        <span className="text-muted">{totalBudget.toFixed(2)} XLM total</span>
      </div>

      <div
        className="overflow-hidden rounded-full border border-border"
        style={{ height: barHeight, backgroundColor: "color-mix(in srgb, var(--color-muted) 14%, transparent)" }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${spentPercent}%`,
            background:
              "linear-gradient(90deg, var(--color-secondary), color-mix(in srgb, var(--color-primary) 75%, var(--color-secondary)))"
          }}
        />
      </div>
    </div>
  );
}
