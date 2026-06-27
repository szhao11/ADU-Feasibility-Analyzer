import type { FindingStatus } from "@/lib/types";
import { cn } from "@/lib/cn";

const STATUS_STYLES: Record<FindingStatus, string> = {
  pass: "bg-emerald-100 text-emerald-800 border-emerald-200",
  fail: "bg-red-100 text-red-800 border-red-200",
  warning: "bg-amber-100 text-amber-800 border-amber-200",
  needs_verification: "bg-sky-100 text-sky-800 border-sky-200",
  info: "bg-slate-100 text-slate-700 border-slate-200",
};

const STATUS_LABELS: Record<FindingStatus, string> = {
  pass: "Pass",
  fail: "Fail",
  warning: "Warning",
  needs_verification: "Verify",
  info: "Info",
};

export function StatusBadge({
  status,
  className,
}: {
  status: FindingStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        STATUS_STYLES[status],
        className
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

export function VerdictBadge({
  verdict,
}: {
  verdict?: "feasible" | "feasible_with_conditions" | "not_feasible";
}) {
  if (!verdict) return null;

  const styles = {
    feasible: "bg-emerald-600 text-white",
    feasible_with_conditions: "bg-amber-600 text-white",
    not_feasible: "bg-red-600 text-white",
  };

  const labels = {
    feasible: "Feasible",
    feasible_with_conditions: "Feasible w/ Conditions",
    not_feasible: "Not Feasible",
  };

  return (
    <span
      className={cn(
        "rounded px-2 py-1 text-xs font-semibold uppercase tracking-wide",
        styles[verdict]
      )}
    >
      {labels[verdict]}
    </span>
  );
}
