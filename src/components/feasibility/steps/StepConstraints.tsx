"use client";

import type { ReactNode } from "react";
import type { FeasibilityProject } from "@/lib/types";
import { inferLikelyNewDriveway } from "@/lib/gis/curb-cut-inference";
import { Checkbox, Card } from "@/components/ui/Form";
import { SiteRequirementsList } from "@/components/feasibility/SiteRequirementsList";

export function StepConstraints({
  project,
  onChange,
}: {
  project: FeasibilityProject;
  onChange: (p: FeasibilityProject) => void;
}) {
  const c = project.constraints;
  const o = project.property.overlays;
  const hasParcel = project.property.gisVerified || !!project.sitePlan.parcelGeoJson;
  const curbCutHint = inferLikelyNewDriveway(project);

  function updateConstraints(patch: Partial<typeof c>) {
    onChange({
      ...project,
      constraints: { ...c, ...patch },
    });
  }

  const manualChecks: {
    key: string;
    node: ReactNode;
  }[] = [];

  if (!o.unpermittedStructureRisk) {
    manualChecks.push({
      key: "unpermitted",
      node: (
        <Checkbox
          label="Unpermitted structures in ADU work area"
          checked={c.unpermittedStructures}
          onChange={(v) => updateConstraints({ unpermittedStructures: v })}
        />
      ),
    });
  }

  if (!o.streetTreesNearby && !o.treeCanopyOnParcel) {
    manualChecks.push({
      key: "trees",
      node: (
        <Checkbox
          label="Heritage or protected trees in construction area"
          hint="BMC Title 7 Ch. 4 tree protection"
          checked={c.heritageTreesInWorkArea}
          onChange={(v) => updateConstraints({ heritageTreesInWorkArea: v })}
        />
      ),
    });
  }

  manualChecks.push({
    key: "curb_cut",
    node: (
      <Checkbox
        label="New driveway or curb cut proposed"
        hint={
          curbCutHint.likely && !c.newDrivewayOrCurbCut
            ? curbCutHint.reason
            : undefined
        }
        checked={c.newDrivewayOrCurbCut}
        onChange={(v) => updateConstraints({ newDrivewayOrCurbCut: v })}
      />
    ),
  });

  if (!o.steepSlopeDetected) {
    manualChecks.push({
      key: "slope_fill",
      node: (
        <Checkbox
          label="Fill or retaining walls in work area (slope not detected by GIS)"
          checked={c.hillsideSlopeConcern}
          onChange={(v) => updateConstraints({ hillsideSlopeConcern: v })}
        />
      ),
    });
  }

  if (!o.permitParkingDistrict) {
    manualChecks.push({
      key: "parking",
      node: (
        <Checkbox
          label="Street is in a residential permit parking district"
          hint="Parking exemption — confirm on City permit zone map if GIS missed your block"
          checked={o.permitParkingDistrict}
          onChange={(v) =>
            onChange({
              ...project,
              property: {
                ...project.property,
                overlays: {
                  ...project.property.overlays,
                  permitParkingDistrict: v,
                },
              },
            })
          }
        />
      ),
    });
  }

  if (!o.historicDistrict) {
    manualChecks.push({
      key: "historic",
      node: (
        <Checkbox
          label="Property is in an architecturally significant historic district"
          hint="Design review and parking exemption may apply"
          checked={o.historicDistrict}
          onChange={(v) =>
            onChange({
              ...project,
              property: {
                ...project.property,
                overlays: {
                  ...project.property.overlays,
                  historicDistrict: v,
                },
              },
            })
          }
        />
      ),
    });
  }

  const gisDetected: string[] = [];
  if (o.steepSlopeDetected) {
    gisDetected.push(
      o.estimatedMaxSlopePct !== undefined
        ? `Steep slope ~${o.estimatedMaxSlopePct}% on lot`
        : "Steep slope on lot"
    );
  }
  if (o.permitParkingDistrict) {
    gisDetected.push(
      o.permitParkingZone
        ? `Permit parking Zone ${o.permitParkingZone}`
        : "Permit parking district"
    );
  }
  if (o.historicDistrict) {
    gisDetected.push(
      o.historicResourceName
        ? `Historic resource: ${o.historicResourceName}`
        : "Historic resource on or near parcel"
    );
  }
  if (o.streetTreesNearby || o.treeCanopyOnParcel) {
    const treeParts: string[] = [];
    if (o.largeStreetTreesNearby && o.largeStreetTreesNearby > 0) {
      treeParts.push(`${o.largeStreetTreesNearby} large street tree(s) nearby`);
    } else if (o.streetTreeCount) {
      treeParts.push(`${o.streetTreeCount} street tree(s) near parcel`);
    }
    if (o.treeCanopyOnParcel) treeParts.push("tree canopy on lot");
    gisDetected.push(treeParts.join("; "));
  }
  if (o.unpermittedStructureRisk) {
    gisDetected.push(
      o.unpermittedStructureNote ?? "Structure footprint discrepancy (LARIAC vs Assessor)"
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Site requirements</h2>
        <p className="mt-1 text-sm text-slate-500">
          Jurisdiction overlays, parking exemptions, fire/hillside standards, and
          site review triggers — derived from GIS and Burbank ADU code. Confirm
          only the conditions below that GIS cannot detect.
        </p>
      </div>

      {!hasParcel && (
        <Card className="border-amber-200 bg-amber-50">
          <p className="text-sm text-amber-900">
            Run parcel lookup on the Property step to auto-detect fire zones,
            transit parking exemptions, structure footprints, hillside overlays,
            permit parking, historic resources, and tree screening.
          </p>
        </Card>
      )}

      <SiteRequirementsList project={project} findings={project.findings} />

      {gisDetected.length > 0 && (
        <Card className="border-sky-200 bg-sky-50">
          <h3 className="mb-2 text-sm font-semibold text-sky-900">
            Auto-detected on parcel lookup
          </h3>
          <ul className="list-inside list-disc space-y-1 text-xs text-sky-800">
            {gisDetected.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Card>
      )}

      {manualChecks.length > 0 && (
        <Card>
          <h3 className="mb-1 text-sm font-semibold text-slate-800">
            Confirm site conditions (GIS cannot detect)
          </h3>
          <p className="mb-3 text-xs text-slate-500">
            Check only what applies to this project. Each selection updates live
            findings and the feasibility verdict.
          </p>
          <div className="space-y-2">
            {manualChecks.map(({ key, node }) => (
              <div key={key}>{node}</div>
            ))}
          </div>
        </Card>
      )}

      {manualChecks.length === 1 &&
        manualChecks[0]?.key === "curb_cut" &&
        hasParcel &&
        gisDetected.length > 0 && (
        <Card className="border-emerald-200 bg-emerald-50">
          <p className="text-sm text-emerald-900">
            GIS screening covered slope, parking, historic, trees, and structure
            footprints for this parcel. Confirm new driveway/curb cut only if your
            ADU design requires new street access.
          </p>
        </Card>
      )}

      {manualChecks.length === 0 && hasParcel && (
        <Card className="border-emerald-200 bg-emerald-50">
          <p className="text-sm text-emerald-900">
            GIS screening covered all site conditions for this parcel. Confirm
            new driveway/curb cut on the checkbox above only if your ADU design
            requires new street access.
          </p>
        </Card>
      )}

      <Card className="border-amber-200 bg-amber-50">
        <p className="text-sm text-amber-900">
          <strong>Builder note:</strong> Front-yard ADU placement and
          &quot;physically infeasible&quot; determinations require City plan review —
          cannot be auto-approved.
        </p>
      </Card>
    </div>
  );
}
