type BudgetBarProps = {
  totalBudget: number;
  remainingBudget: number;
  size?: "sm" | "md";
};

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

export function BudgetBar({
  totalBudget,
  remainingBudget,
  size = "md",
}: BudgetBarProps) {
  const safeTotal = totalBudget > 0 ? totalBudget : 1;
  const spentPercent = clampPercent(
    ((safeTotal - remainingBudget) / safeTotal) * 100,
  );
  const barHeight = size === "sm" ? "0.45rem" : "0.65rem";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-[#0A0A0A]">
          {remainingBudget.toFixed(2)} XLM left
        </span>
        <span className="font-medium text-[#525252]">
          {totalBudget.toFixed(2)} XLM total
        </span>
      </div>

      <div
        className="overflow-hidden border border-[#E5E5E5] bg-[#F5F5F5] [border-radius:6px]"
        style={{ height: barHeight }}
      >
        <div
          className="h-full bg-[#F59E0B]"
          style={{ width: `${spentPercent}%` }}
        />
      </div>
    </div>
  );
}
