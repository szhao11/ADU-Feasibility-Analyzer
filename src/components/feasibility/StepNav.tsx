import type { WizardStep } from "@/lib/types";
import { cn } from "@/lib/cn";
import { Check } from "lucide-react";

export const WIZARD_STEPS: { id: WizardStep; label: string }[] = [
  { id: "property", label: "Property" },
  { id: "eligibility", label: "Eligibility" },
  { id: "adu_type", label: "ADU Type" },
  { id: "envelope", label: "Envelope" },
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
    <nav className="space-y-1">
      {WIZARD_STEPS.map((step, idx) => {
        const isActive = step.id === current;
        const isDone = completed.has(step.id);
        const isPast = idx < currentIdx;

        return (
          <button
            key={step.id}
            type="button"
            onClick={() => onStepClick(step.id)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors",
              isActive
                ? "bg-slate-900 text-white"
                : isPast || isDone
                  ? "text-slate-700 hover:bg-slate-100"
                  : "text-slate-400 hover:bg-slate-50"
            )}
          >
            <span
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                isActive
                  ? "bg-white text-slate-900"
                  : isDone
                    ? "bg-emerald-500 text-white"
                    : "border border-current"
              )}
            >
              {isDone ? <Check className="h-3 w-3" /> : idx + 1}
            </span>
            {step.label}
          </button>
        );
      })}
    </nav>
  );
}
