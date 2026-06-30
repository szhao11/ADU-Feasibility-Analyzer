"use client";

import type { FeasibilityProject, RuleFinding } from "@/lib/types";
import { getSiteRequirements } from "@/lib/rules/site-requirements";
import { Card } from "@/components/ui/Form";
import { StatusBadge } from "@/components/ui/StatusBadge";

export function SiteRequirementsList({
  project,
  findings,
}: {
  project: FeasibilityProject;
  findings: RuleFinding[];
}) {
  const requirements = getSiteRequirements(project);
  const liveChecks = findings.filter((f) => f.category === "Site");

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="mb-1 text-sm font-semibold text-slate-800">
          Burbank site requirements
        </h3>
        <p className="mb-3 text-xs text-slate-500">
          Auto-populated from parcel GIS, site plan footprints, and BMC ADU
          standards. Updates live findings and verdict as you move through the
          wizard.
        </p>
        <ul className="divide-y divide-slate-100">
          {requirements.map((req) => (
            <li
              key={req.id}
              className="flex flex-wrap items-start justify-between gap-2 py-2.5 first:pt-0 last:pb-0"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-slate-900">{req.label}</p>
                  <StatusBadge status={req.status} />
                </div>
                <p className="mt-0.5 text-sm text-slate-600">{req.value}</p>
                <p className="font-mono text-[10px] text-slate-400">{req.citation}</p>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {liveChecks.length > 0 && (
        <Card>
          <h3 className="mb-2 text-sm font-semibold text-slate-800">
            Live site checks
          </h3>
          <ul className="space-y-2">
            {liveChecks.map((f) => (
              <li
                key={f.id}
                className="flex items-start justify-between gap-2 text-sm"
              >
                <span className="text-slate-700">{f.summary}</span>
                <StatusBadge status={f.status} />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
