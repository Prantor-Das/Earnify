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
        <span className="font-semibold text-[#f5f5f5]">{remainingBudget.toFixed(2)} XLM left</span>
        <span className="font-medium text-[var(--color-muted)]">{totalBudget.toFixed(2)} XLM total</span>
      </div>

      <div
        className="overflow-hidden rounded-sm border border-[var(--color-border)] bg-black/45"
        style={{ height: barHeight }}
      >
        <div
          className="h-full rounded-sm bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-accent)] shadow-[0_0_20px_-8px_rgba(245,158,11,0.8)]"
          style={{ width: `${spentPercent}%` }}
        />
      </div>
    </div>
  );
}
