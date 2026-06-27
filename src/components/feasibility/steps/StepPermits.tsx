"use client";

import { useState } from "react";
import type { FeasibilityProject } from "@/lib/types";
import { getBurbankPermitPathway } from "@/lib/rules/engine";
import { Checkbox, Card } from "@/components/ui/Form";

export function StepPermits({ project }: { project: FeasibilityProject }) {
  const [useBpap, setUseBpap] = useState(false);
  const steps = getBurbankPermitPathway(useBpap);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Permit pathway</h2>
        <p className="mt-1 text-sm text-slate-500">
          Burbank ADU approval stack for{" "}
          {project.property.address || "this project"}.
        </p>
      </div>

      <Checkbox
        label="Evaluate Burbank Pre-Approved ADU Program (BPAP) path"
        hint="Standard plan sets — faster review if site fits"
        checked={useBpap}
        onChange={setUseBpap}
      />

      <div className="space-y-3">
        {steps.map((step) => (
          <Card key={`${step.order}-${step.title}`} className="relative pl-4">
            <div className="absolute left-0 top-4 h-full w-0.5 bg-slate-200" />
            <div className="absolute -left-1.5 top-3 flex h-4 w-4 items-center justify-center rounded-full bg-slate-900 text-[9px] font-bold text-white">
              {step.order}
            </div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
              {step.department}
            </p>
            <h3 className="text-sm font-semibold text-slate-900">{step.title}</h3>
            <p className="mt-1 text-sm text-slate-600">{step.description}</p>
            {step.timeline && (
              <p className="mt-1 text-xs text-slate-500">Timeline: {step.timeline}</p>
            )}
            {step.contact && (
              <p className="mt-1 font-mono text-xs text-slate-500">{step.contact}</p>
            )}
            {step.forms && step.forms.length > 0 && (
              <ul className="mt-2 list-inside list-disc text-xs text-slate-500">
                {step.forms.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
