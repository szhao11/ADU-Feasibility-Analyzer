"use client";

import { useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import type { FeasibilityProject } from "@/lib/types";
import {
  syncEnvelopeFromSitePlan,
  updateAduFootprint,
  getAduFootprint,
  computeMaxAduFootprint,
  constrainAduToMaxFootprint,
  getAduPlacementBounds,
} from "@/lib/geometry/site-plan";
import {
  getDefaultSetbacks,
  getMaxAduSqFt,
  getSitePlanSyncOptions,
} from "@/lib/rules/envelope-requirements";
import { TextInput, Card } from "@/components/ui/Form";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EnvelopeRequirementsList } from "@/components/feasibility/EnvelopeRequirementsList";

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

function formatFact(value: number | string | undefined, suffix = ""): string {
  if (value === undefined || value === "") return "—";
  if (typeof value === "number") {
    return `${value.toLocaleString()}${suffix}`;
  }
  return String(value);
}

export function StepEligibilityEnvelope({
  project,
  onChange,
  onGoToProperty,
}: {
  project: FeasibilityProject;
  onChange: (p: FeasibilityProject) => void;
  onGoToProperty?: () => void;
}) {
  const p = project.property;
  const env = project.envelope;
  const adu = getAduFootprint(project.sitePlan);
  const hasMap = !!project.sitePlan.parcelGeoJson;
  const hasParcelData = p.gisVerified || hasMap;
  const eligibility = project.findings.filter((f) => f.category === "Eligibility");
  const zoneEligibility = eligibility.find((f) => f.id === "eligibility.zone");
  const eligibilityAlerts = eligibility.filter(
    (f) =>
      f.id !== "eligibility.review_type" &&
      f.id !== "eligibility.zone" &&
      (f.status === "warning" || f.status === "fail")
  );
  const setbacks = getDefaultSetbacks(project);
  const maxFootprint = hasMap
    ? computeMaxAduFootprint(
        project.sitePlan,
        setbacks,
        getMaxAduSqFt(project)
      )
    : null;
  const placementBounds =
    maxFootprint && adu
      ? getAduPlacementBounds(maxFootprint, adu.widthFt, adu.depthFt)
      : null;
  const constrainedRef = useRef<string | null>(null);

  function applySitePlan(sitePlan: typeof project.sitePlan) {
    const envelope = syncEnvelopeFromSitePlan(
      sitePlan,
      project.envelope,
      getSitePlanSyncOptions(project)
    );
    onChange({ ...project, sitePlan, envelope });
  }

  function updateAdu(patch: Parameters<typeof updateAduFootprint>[1]) {
    applySitePlan(updateAduFootprint(project.sitePlan, patch, maxFootprint));
  }

  useEffect(() => {
    if (constrainedRef.current === project.id || !hasMap || !adu || !maxFootprint) {
      return;
    }
    const constrained = constrainAduToMaxFootprint(adu, maxFootprint);
    if (
      constrained.centerXFt !== adu.centerXFt ||
      constrained.centerYFt !== adu.centerYFt ||
      constrained.widthFt !== adu.widthFt ||
      constrained.depthFt !== adu.depthFt
    ) {
      applySitePlan(
        updateAduFootprint(project.sitePlan, constrained, maxFootprint)
      );
    }
    constrainedRef.current = project.id;
  }, [hasMap, maxFootprint, adu, project.sitePlan, project.id]);

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

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-slate-800">Overview</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Key site facts and eligibility for build planning.
          </p>
        </div>

        <Card className="bg-slate-50">
          {!hasParcelData ? (
            <p className="text-sm text-slate-500">
              No parcel data yet.{" "}
              {onGoToProperty ? (
                <button
                  type="button"
                  onClick={onGoToProperty}
                  className="font-medium text-sky-700 underline hover:text-sky-900"
                >
                  Run property lookup
                </button>
              ) : (
                "Complete the Property step first."
              )}
            </p>
          ) : (
            <div className="space-y-4">
              {eligibilityAlerts.length > 0 && (
                <ul className="space-y-1.5">
                  {eligibilityAlerts.map((f) => (
                    <li
                      key={f.id}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <span className="text-slate-800">{f.summary}</span>
                      <StatusBadge status={f.status} />
                    </li>
                  ))}
                </ul>
              )}

              <dl className="grid gap-x-4 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="text-xs font-semibold uppercase text-slate-500">Zone</dt>
                  <dd className="font-mono font-medium text-slate-900">{p.zone}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase text-slate-500">Lot</dt>
                  <dd className="font-mono text-slate-900">
                    {formatFact(p.lotSqFt, " sf")}
                    {p.lotWidthFt && p.lotDepthFt && (
                      <span className="text-slate-500">
                        {" "}
                        · {p.lotWidthFt}×{p.lotDepthFt} ft
                      </span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase text-slate-500">
                    Primary dwelling
                  </dt>
                  <dd className="font-mono text-slate-900">
                    {formatFact(p.primarySqFt, " sf")}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase text-slate-500">
                    ADU eligibility
                  </dt>
                  <dd className="flex items-center gap-2">
                    <span className="text-slate-900">
                      {zoneEligibility?.status === "pass" ? "Permitted" : "Verify zone"}
                    </span>
                    {zoneEligibility && <StatusBadge status={zoneEligibility.status} />}
                  </dd>
                </div>
                {p.apn && (
                  <div>
                    <dt className="text-xs font-semibold uppercase text-slate-500">APN</dt>
                    <dd className="font-mono text-slate-900">{p.apn}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-xs font-semibold uppercase text-slate-500">Review</dt>
                  <dd className="text-slate-900">Ministerial · 60-day</dd>
                </div>
                {hasMap && (
                  <>
                    <div>
                      <dt className="text-xs font-semibold uppercase text-slate-500">
                        Side / rear setback
                      </dt>
                      <dd className="font-mono text-slate-900">
                        {env.mapSideSetbackFt?.toFixed(1) ?? "—"} /{" "}
                        {env.mapRearSetbackFt?.toFixed(1) ?? "—"} ft
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase text-slate-500">
                        Primary separation
                      </dt>
                      <dd className="font-mono text-slate-900">
                        {env.mapSeparationFt?.toFixed(1) ?? "—"} ft
                      </dd>
                    </div>
                  </>
                )}
              </dl>

              {(env.mapDesignWarnings?.length ?? 0) > 0 && (
                <ul className="space-y-1 border-t border-slate-200 pt-3 text-xs text-amber-800">
                  {env.mapDesignWarnings!.map((w) => (
                    <li key={w}>• {w}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Card>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-slate-800">Site map</h3>
        <SiteEnvelopeMap project={project} />
      </section>

      {hasMap && adu && (
        <section>
          <Card>
            <h3 className="mb-3 text-sm font-semibold text-slate-800">
              ADU placement
            </h3>
            <p className="mb-3 text-xs text-slate-500">
              Adjust footprint size and position in local feet from the front-left origin.
            </p>
            <div className="mb-4 max-w-xs">
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
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="text-xs font-semibold uppercase text-slate-500">
                Width (ft): {adu.widthFt}
              </label>
              <input
                type="range"
                min={12}
                max={placementBounds?.maxWidthFt ?? 40}
                step={1}
                value={adu.widthFt}
                onChange={(e) => updateAdu({ widthFt: Number(e.target.value) })}
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
                max={placementBounds?.maxDepthFt ?? 48}
                step={1}
                value={adu.depthFt}
                onChange={(e) => updateAdu({ depthFt: Number(e.target.value) })}
                className="mt-1 w-full"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-slate-500">
                Position X: {adu.centerXFt.toFixed(0)} ft
              </label>
              <input
                type="range"
                min={placementBounds?.minX ?? 4}
                max={
                  placementBounds?.maxX ?? Math.max(p.lotWidthFt ?? 80, 40)
                }
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
                min={placementBounds?.minY ?? 4}
                max={
                  placementBounds?.maxY ?? Math.max(p.lotDepthFt ?? 100, 50)
                }
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
        </section>
      )}

      {hasMap && env.floorAreaAnalysis && (
        <section>
          <Card className="bg-slate-50">
            <h3 className="mb-2 text-sm font-semibold text-slate-800">
              Floor area capacity
            </h3>
            <p className="mb-3 text-xs text-slate-500">
              Code max {env.floorAreaAnalysis.codeMaxSqFt.toLocaleString()} sf total
              floor area. Floor-to-floor heuristic:{" "}
              {env.floorAreaAnalysis.minFloorToFloorFt}&apos; min (
              {env.floorAreaAnalysis.minHabitableCeilingFt}&apos; CBC habitable ceiling).
              {project.intent.aduTypes.length === 0 &&
                " Showing default ADU types until you select one on step 3."}
            </p>
            <div className="space-y-4">
              {env.floorAreaAnalysis.byType.map((row) => (
                <div
                  key={row.aduType}
                  className="rounded-md border border-slate-200 bg-white p-3"
                >
                  <p className="text-sm font-medium text-slate-900">{row.label}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Height: {row.height.plateFt}&apos; plate / {row.height.roofFt}&apos;
                    roof
                  </p>
                  <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-slate-500">
                        Max total (single story)
                      </dt>
                      <dd className="font-mono font-semibold">
                        {row.maxSingleStoryTotalSqFt.toLocaleString()} sf
                        <span className="ml-1 text-xs font-normal text-slate-500">
                          ({row.singleStoryFootprintSqFt.toLocaleString()} sf footprint)
                        </span>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">
                        Max total (two stories)
                      </dt>
                      <dd className="font-mono font-semibold">
                        {row.maxTwoStoryTotalSqFt !== null ? (
                          <>
                            {row.maxTwoStoryTotalSqFt.toLocaleString()} sf
                            <span className="ml-1 text-xs font-normal text-slate-500">
                              ({row.twoStoryFootprintSqFt?.toLocaleString()} sf × 2)
                            </span>
                          </>
                        ) : (
                          <span className="text-slate-500">N/A — one story only</span>
                        )}
                      </dd>
                    </div>
                  </dl>
                  {row.stories.singleStoryOnly && row.stories.note && (
                    <p className="mt-2 text-xs text-amber-800">{row.stories.note}</p>
                  )}
                  {!row.stories.singleStoryOnly && row.stories.note && (
                    <p className="mt-2 text-xs text-slate-600">{row.stories.note}</p>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </section>
      )}

      <section>
        <EnvelopeRequirementsList project={project} findings={project.findings} />
      </section>
    </div>
  );
}
