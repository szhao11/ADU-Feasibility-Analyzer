"use client";

import type { FeasibilityProject } from "@/lib/types";
import { Card } from "@/components/ui/Form";
import { StatusBadge, VerdictBadge } from "@/components/ui/StatusBadge";

export function StepEligibility({
  project,
}: {
  project: FeasibilityProject;
}) {
  const eligibility = project.findings.filter((f) => f.category === "Eligibility");

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Eligibility screen
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Zone, count limits, and ministerial review path for{" "}
            <span className="font-medium">{project.property.address || "this parcel"}</span>
            .
          </p>
        </div>
        <VerdictBadge verdict={project.verdict} />
      </div>

      <Card className="bg-slate-50">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase text-slate-500">Zone</dt>
            <dd className="font-mono text-slate-900">{project.property.zone}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase text-slate-500">Jurisdiction</dt>
            <dd className="text-slate-900">City of Burbank</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase text-slate-500">Review type</dt>
            <dd className="text-slate-900">Ministerial (60-day)</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase text-slate-500">Code base</dt>
            <dd className="font-mono text-xs text-slate-700">BMC § 10-1-620.3</dd>
          </div>
        </dl>
      </Card>

      <div className="space-y-2">
        {eligibility.map((f) => (
          <Card key={f.id} className="flex items-start justify-between gap-3 p-3">
            <div>
              <p className="text-sm font-medium text-slate-900">{f.summary}</p>
              {f.detail && (
                <p className="mt-1 text-xs text-slate-500">{f.detail}</p>
              )}
              <p className="mt-1 font-mono text-[10px] text-slate-400">
                {f.citation.citation}
              </p>
            </div>
            <StatusBadge status={f.status} />
          </Card>
        ))}
      </div>
    </div>
  );
}
