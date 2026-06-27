"use client";

import type { FeasibilityProject } from "@/lib/types";
import { Checkbox, Card } from "@/components/ui/Form";

export function StepConstraints({
  project,
  onChange,
}: {
  project: FeasibilityProject;
  onChange: (p: FeasibilityProject) => void;
}) {
  const c = project.constraints;

  function update(patch: Partial<typeof c>) {
    onChange({
      ...project,
      constraints: { ...c, ...patch },
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Site constraints</h2>
        <p className="mt-1 text-sm text-slate-500">
          Flag conditions that trigger additional review or field verification.
        </p>
      </div>

      <div className="space-y-2">
        <Checkbox
          label="Unpermitted structures on lot"
          checked={c.unpermittedStructures}
          onChange={(v) => update({ unpermittedStructures: v })}
        />
        <Checkbox
          label="Heritage trees in work area"
          hint="BMC Title 7 Ch. 4 tree protection"
          checked={c.heritageTreesInWorkArea}
          onChange={(v) => update({ heritageTreesInWorkArea: v })}
        />
        <Checkbox
          label="New driveway or curb cut proposed"
          checked={c.newDrivewayOrCurbCut}
          onChange={(v) => update({ newDrivewayOrCurbCut: v })}
        />
        <Checkbox
          label="Hillside / slope concerns"
          checked={c.hillsideSlopeConcern}
          onChange={(v) => update({ hillsideSlopeConcern: v })}
        />
      </div>

      <Card className="bg-amber-50 border-amber-200">
        <p className="text-sm text-amber-900">
          <strong>Builder note:</strong> Front-yard ADU placement and
          &quot;physically infeasible&quot; determinations require City plan review —
          cannot be auto-approved.
        </p>
      </Card>
    </div>
  );
}
