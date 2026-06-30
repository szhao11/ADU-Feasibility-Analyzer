"use client";

import type { AduType, FeasibilityProject } from "@/lib/types";
import { recommendAduTypes } from "@/lib/rules/engine";
import { Card, Checkbox, SelectInput } from "@/components/ui/Form";
import { cn } from "@/lib/cn";

const ADU_TYPE_INFO: Record<
  AduType,
  { label: string; description: string }
> = {
  detached: {
    label: "Detached new construction",
    description: "4' setbacks; 850–1,000 sf; 17' height (one story)",
  },
  attached: {
    label: "Attached addition",
    description: "Shared wall; 20' plate / 30' roof height limits",
  },
  garage_conversion: {
    label: "Garage conversion",
    description: "Retain legal non-conforming setbacks; no parking replacement",
  },
  adu_on_garage: {
    label: "ADU on garage (2nd story)",
    description: "20' plate / 23' roof; 4' side/rear setbacks",
  },
  jadu: {
    label: "Junior ADU (JADU)",
    description: "≤500 sf within primary; R-1/R-1-H only; no parking",
  },
};

export function StepAduType({
  project,
  onChange,
}: {
  project: FeasibilityProject;
  onChange: (p: FeasibilityProject) => void;
}) {
  const recs = recommendAduTypes(project);
  const intent = project.intent;

  function toggleType(type: AduType) {
    const types = intent.aduTypes.includes(type)
      ? intent.aduTypes.filter((t) => t !== type)
      : [...intent.aduTypes, type];

    const isConversion =
      types.includes("garage_conversion") ||
      types.includes("jadu");

    onChange({
      ...project,
      intent: {
        ...intent,
        aduTypes: types,
        isConversion,
        sameFootprintConversion: types.includes("garage_conversion")
          ? intent.sameFootprintConversion
          : undefined,
      },
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">ADU type selection</h2>
        <p className="mt-1 text-sm text-slate-500">
          Select one or more paths to evaluate. Recommendations based on parcel inputs.
        </p>
      </div>

      {recs.length > 0 && (
        <Card className="border-emerald-200 bg-emerald-50">
          <p className="text-xs font-semibold uppercase text-emerald-700">
            Recommended for this lot
          </p>
          <p className="mt-1 text-sm text-emerald-900">
            {recs.map((t) => ADU_TYPE_INFO[t].label).join(" · ")}
          </p>
        </Card>
      )}

      <div className="space-y-2">
        {(Object.keys(ADU_TYPE_INFO) as AduType[]).map((type) => {
          const info = ADU_TYPE_INFO[type];
          const selected = intent.aduTypes.includes(type);
          const recommended = recs.includes(type);

          return (
            <button
              key={type}
              type="button"
              onClick={() => toggleType(type)}
              className={cn(
                "w-full rounded-lg border p-3 text-left transition-colors",
                selected
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white hover:border-slate-300"
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">{info.label}</span>
                {recommended && !selected && (
                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                    Rec
                  </span>
                )}
              </div>
              <p
                className={cn(
                  "mt-1 text-xs",
                  selected ? "text-slate-300" : "text-slate-500"
                )}
              >
                {info.description}
              </p>
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectInput
          label="Bedrooms (ADU)"
          value={String(intent.bedrooms)}
          onChange={(e) =>
            onChange({
              ...project,
              intent: {
                ...intent,
                bedrooms: Number(e.target.value) as 0 | 1 | 2 | 3,
              },
            })
          }
          options={[
            { value: "0", label: "Studio" },
            { value: "1", label: "1 Bedroom" },
            { value: "2", label: "2 Bedrooms" },
            { value: "3", label: "3 Bedrooms" },
          ]}
        />
        <SelectInput
          label="Extra parking (deed-restricted bonus)"
          value={String(intent.extraParkingSpaces ?? 0)}
          onChange={(e) =>
            onChange({
              ...project,
              intent: {
                ...intent,
                extraParkingSpaces: Number(e.target.value),
              },
            })
          }
          options={[
            { value: "0", label: "None" },
            { value: "1", label: "+1 space (+120 sf max)" },
          ]}
        />
      </div>

      {intent.aduTypes.includes("detached") &&
        !project.property.hasGarage &&
        project.property.gisVerified && (
          <Card className="border-amber-200 bg-amber-50">
            <p className="text-xs text-amber-900">
              No garage footprint detected on this lot. If the detached ADU needs
              new driveway or curb cut access, confirm on the Site step.
            </p>
          </Card>
        )}

      {intent.aduTypes.includes("garage_conversion") && (
        <Checkbox
          label="Conversion within existing legal footprint (same location & dimensions)"
          checked={intent.sameFootprintConversion ?? false}
          onChange={(v) =>
            onChange({
              ...project,
              intent: { ...intent, sameFootprintConversion: v },
            })
          }
        />
      )}
    </div>
  );
}
