"use client";

import dynamic from "next/dynamic";
import type { FeasibilityProject } from "@/lib/types";
import {
  syncEnvelopeFromSitePlan,
  updateAduFootprint,
  getAduFootprint,
} from "@/lib/geometry/site-plan";
import { TextInput, Card } from "@/components/ui/Form";
import { StatusBadge } from "@/components/ui/StatusBadge";

const SiteEnvelopeMap = dynamic(
  () =>
    import("@/components/map/SiteEnvelopeMap").then((m) => m.SiteEnvelopeMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-80 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-500">
        Loading map…
      </div>
    ),
  }
);

export function StepEnvelope({
  project,
  onChange,
}: {
  project: FeasibilityProject;
  onChange: (p: FeasibilityProject) => void;
}) {
  const env = project.envelope;
  const adu = getAduFootprint(project.sitePlan);
  const hasMap = !!project.sitePlan.parcelGeoJson;

  function applySitePlan(sitePlan: typeof project.sitePlan) {
    const envelope = syncEnvelopeFromSitePlan(
      sitePlan,
      project.envelope,
      project.property.frontSetbackFt
    );
    onChange({ ...project, sitePlan, envelope });
  }

  function updateAdu(patch: Parameters<typeof updateAduFootprint>[1]) {
    applySitePlan(updateAduFootprint(project.sitePlan, patch));
  }

  function updateManual(patch: Partial<typeof env>) {
    onChange({
      ...project,
      envelope: { ...env, ...patch },
      intent: {
        ...project.intent,
        targetSqFt: patch.proposedSqFt ?? project.intent.targetSqFt,
      },
    });
  }

  const mapFindings = project.findings.filter((f) => f.category === "Site Map");
  const otherFindings = project.findings.filter(
    (f) =>
      f.category === "Size" ||
      f.category === "Setbacks" ||
      f.category === "Height"
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">
          Development envelope
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Place the ADU footprint on the parcel map. Setbacks and separation
          from the primary dwelling are measured automatically.
        </p>
      </div>

      <SiteEnvelopeMap project={project} />

      {hasMap && adu && (
        <Card>
          <h3 className="mb-3 text-sm font-semibold text-slate-800">
            ADU placement (local feet from front-left origin)
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="text-xs font-semibold uppercase text-slate-500">
                Width (ft): {adu.widthFt}
              </label>
              <input
                type="range"
                min={12}
                max={40}
                step={1}
                value={adu.widthFt}
                onChange={(e) =>
                  updateAdu({ widthFt: Number(e.target.value) })
                }
                className="mt-1 w-full"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-slate-500">
                Depth (ft): {adu.depthFt}
              </label>
              <input
                type="range"
                min={12}
                max={48}
                step={1}
                value={adu.depthFt}
                onChange={(e) =>
                  updateAdu({ depthFt: Number(e.target.value) })
                }
                className="mt-1 w-full"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-slate-500">
                Position X: {adu.centerXFt.toFixed(0)} ft
              </label>
              <input
                type="range"
                min={4}
                max={Math.max(project.property.lotWidthFt ?? 80, 40)}
                step={1}
                value={adu.centerXFt}
                onChange={(e) =>
                  updateAdu({ centerXFt: Number(e.target.value) })
                }
                className="mt-1 w-full"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-slate-500">
                Position Y (depth): {adu.centerYFt.toFixed(0)} ft
              </label>
              <input
                type="range"
                min={4}
                max={Math.max(project.property.lotDepthFt ?? 100, 50)}
                step={1}
                value={adu.centerYFt}
                onChange={(e) =>
                  updateAdu({ centerYFt: Number(e.target.value) })
                }
                className="mt-1 w-full"
              />
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput
          label="Proposed height to roof (ft)"
          type="number"
          value={env.proposedHeightFt ?? ""}
          onChange={(e) =>
            updateManual({
              proposedHeightFt: e.target.value ? Number(e.target.value) : undefined,
            })
          }
        />
        <TextInput
          label="Proposed ADU area (sq ft)"
          type="number"
          value={env.proposedSqFt ?? ""}
          onChange={(e) =>
            updateManual({
              proposedSqFt: e.target.value ? Number(e.target.value) : undefined,
            })
          }
        />
      </div>

      {hasMap && (
        <Card className="bg-slate-50">
          <h3 className="mb-2 text-sm font-semibold text-slate-800">
            Measured from site plan
          </h3>
          <dl className="grid gap-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-slate-500">Side setback</dt>
              <dd className="font-mono font-semibold">
                {env.mapSideSetbackFt?.toFixed(1) ?? "—"} ft
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Rear setback</dt>
              <dd className="font-mono font-semibold">
                {env.mapRearSetbackFt?.toFixed(1) ?? "—"} ft
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Primary separation</dt>
              <dd className="font-mono font-semibold">
                {env.mapSeparationFt?.toFixed(1) ?? "—"} ft
              </dd>
            </div>
          </dl>
        </Card>
      )}

      {mapFindings.length > 0 && (
        <Card>
          <h3 className="mb-2 text-sm font-semibold text-slate-800">
            Map envelope checks
          </h3>
          <ul className="space-y-2">
            {mapFindings.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2 text-sm">
                <span>{f.summary}</span>
                <StatusBadge status={f.status} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {otherFindings.length > 0 && (
        <Card>
          <h3 className="mb-2 text-sm font-semibold text-slate-800">
            Code envelope checks
          </h3>
          <ul className="space-y-1 text-sm text-slate-700">
            {otherFindings.map((f) => (
              <li key={f.id} className="flex justify-between gap-2">
                <span>{f.summary}</span>
                <span className="shrink-0 font-mono text-xs uppercase text-slate-400">
                  {f.status}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
