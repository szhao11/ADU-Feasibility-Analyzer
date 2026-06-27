"use client";

import type { FeasibilityProject } from "@/lib/types";
import { Checkbox } from "@/components/ui/Form";

export function StepUtilities({
  project,
  onChange,
}: {
  project: FeasibilityProject;
  onChange: (p: FeasibilityProject) => void;
}) {
  const u = project.utilities;

  function update(patch: Partial<typeof u>) {
    onChange({
      ...project,
      utilities: { ...u, ...patch },
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">
          Utilities & infrastructure
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Burbank Water & Power and Public Works review required on all ADU permits.
        </p>
      </div>

      <div className="space-y-2">
        <Checkbox
          label="Electrical panel upgrade likely"
          checked={u.panelUpgradeLikely}
          onChange={(v) => update({ panelUpgradeLikely: v })}
        />
        <Checkbox
          label="Sewer lateral condition unknown"
          checked={u.sewerLateralUnknown}
          onChange={(v) => update({ sewerLateralUnknown: v })}
        />
        <Checkbox
          label="Water meter upgrade unknown"
          checked={u.waterMeterUpgradeUnknown}
          onChange={(v) => update({ waterMeterUpgradeUnknown: v })}
        />
        <Checkbox
          label="School impact fees applicable (BUSD)"
          checked={u.schoolFeesApplicable}
          onChange={(v) => update({ schoolFeesApplicable: v })}
        />
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        <p className="font-semibold text-slate-800">Required submittals</p>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>BWP Electric ADU Plan Check Requirements</li>
          <li>BWP Water Fixture Count Form</li>
          <li>Public Works sewer/drainage review (assigned in ProjectDox)</li>
        </ul>
      </div>
    </div>
  );
}
