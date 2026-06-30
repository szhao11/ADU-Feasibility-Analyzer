import type { WizardStep } from "@/lib/types";
import { cn } from "@/lib/cn";
import { Check } from "lucide-react";

export const WIZARD_STEPS: { id: WizardStep; label: string }[] = [
  { id: "property", label: "Property" },
  { id: "eligibility_envelope", label: "Eligibility & Envelope" },
  { id: "adu_type", label: "ADU Type" },
  { id: "constraints", label: "Site" },
  { id: "utilities", label: "Utilities" },
  { id: "permits", label: "Permits" },
  { id: "report", label: "Report" },
];

export function StepNav({
  current,
  completed,
  onStepClick,
}: {
  current: WizardStep;
  completed: Set<WizardStep>;
  onStepClick: (step: WizardStep) => void;
}) {
  const currentIdx = WIZARD_STEPS.findIndex((s) => s.id === current);

  return (
    <nav
      className="flex items-stretch gap-0 overflow-x-auto border-b border-slate-200 bg-white px-4"
      aria-label="Project workflow"
    >
      {WIZARD_STEPS.map((step, idx) => {
        const isActive = step.id === current;
        const isDone = completed.has(step.id);
        const isPast = idx < currentIdx;
        const isReachable = isPast || isDone || isActive;

        return (
          <div key={step.id} className="flex min-w-0 items-stretch">
            {idx > 0 && (
              <div
                className={cn(
                  "mt-5 h-px w-4 shrink-0 self-start sm:w-6",
                  isPast || isDone ? "bg-emerald-400" : "bg-slate-200"
                )}
                aria-hidden
              />
            )}
            <button
              type="button"
              onClick={() => onStepClick(step.id)}
              className={cn(
                "flex min-w-[5.5rem] flex-col items-center gap-1.5 px-2 py-3 text-center transition-colors sm:min-w-0 sm:flex-row sm:gap-2 sm:px-3",
                isActive
                  ? "border-b-2 border-slate-900 text-slate-900"
                  : isReachable
                    ? "border-b-2 border-transparent text-slate-700 hover:bg-slate-50"
                    : "border-b-2 border-transparent text-slate-400 hover:bg-slate-50"
              )}
            >
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                  isActive
                    ? "bg-slate-900 text-white"
                    : isDone
                      ? "bg-emerald-500 text-white"
                      : isPast
                        ? "bg-emerald-100 text-emerald-700"
                        : "border border-slate-300 bg-white text-slate-500"
                )}
              >
                {isDone ? <Check className="h-3.5 w-3.5" /> : idx + 1}
              </span>
              <span className="text-[11px] font-medium leading-tight sm:text-xs sm:whitespace-nowrap">
                {step.label}
              </span>
            </button>
          </div>
        );
      })}
    </nav>
  );
}
