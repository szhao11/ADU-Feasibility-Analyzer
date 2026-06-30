"use client";

import type { FeasibilityProject, RuleFinding } from "@/lib/types";
import { getEnvelopeRequirements } from "@/lib/rules/envelope-requirements";
import { Card } from "@/components/ui/Form";
import { StatusBadge } from "@/components/ui/StatusBadge";

export function EnvelopeRequirementsList({
  project,
  findings,
}: {
  project: FeasibilityProject;
  findings: RuleFinding[];
}) {
  const requirements = getEnvelopeRequirements(project);
  const checkCategories = new Set(["Setbacks", "Height", "Size", "Site Map"]);
  const checks = findings.filter((f) => checkCategories.has(f.category));

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="mb-3 text-sm font-semibold text-slate-800">
          Development requirements (Burbank)
        </h3>
        <ul className="divide-y divide-slate-100">
          {requirements.map((req) => (
            <li
              key={req.id}
              className="flex flex-wrap items-baseline justify-between gap-2 py-2.5 first:pt-0 last:pb-0"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">{req.label}</p>
                <p className="font-mono text-[10px] text-slate-400">{req.citation}</p>
              </div>
              <p className="shrink-0 text-sm font-semibold text-slate-700">
                {req.value}
              </p>
            </li>
          ))}
        </ul>
      </Card>

      {checks.length > 0 && (
        <Card>
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-slate-800">
              Live checks
              <span className="ml-2 text-xs font-normal text-slate-500">
                ({checks.length})
              </span>
            </summary>
            <ul className="mt-3 space-y-2 border-t border-slate-100 pt-3">
              {checks.map((f) => (
                <li
                  key={f.id}
                  className="flex items-start justify-between gap-2 text-sm"
                >
                  <span className="text-slate-700">{f.summary}</span>
                  <StatusBadge status={f.status} />
                </li>
              ))}
            </ul>
          </details>
        </Card>
      )}
    </div>
  );
}
