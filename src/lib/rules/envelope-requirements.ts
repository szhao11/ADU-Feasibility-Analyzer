import type { AduType, FeasibilityProject, SitePlanSyncOptions } from "../types";
import { getAduHeightLimits } from "./adu-floor-area";

const ADU_HANDOUT =
  "https://www.burbankca.gov/documents/d/community-development/adu-handout-updated-7-11-2024";

export const MIN_SIDE_SETBACK_FT = 4;
export const MIN_REAR_SETBACK_FT = 4;
export const MIN_SEPARATION_FACE_FT = 5;
export const MIN_SEPARATION_EAVE_FT = 4;
export const DEFAULT_FRONT_SETBACK_FT = 20;
/** Minimum clear side passage for fire access / egress (plan-check heuristic). */
export const MIN_EGRESS_ACCESS_FT = 3;
/** Warn when max ADU consumes this share of net buildable area. */
export const BUILDABLE_CONSUMED_WARN_PCT = 90;

export interface EnvelopeRequirement {
  id: string;
  label: string;
  value: string;
  citation: string;
  sourceUrl?: string;
}

export interface SetbackRequirements {
  frontFt: number;
  sideFt: number;
  rearFt: number;
}

export function getDefaultSetbacks(project: FeasibilityProject): SetbackRequirements {
  return {
    frontFt: project.property.frontSetbackFt ?? DEFAULT_FRONT_SETBACK_FT,
    sideFt: MIN_SIDE_SETBACK_FT,
    rearFt: MIN_REAR_SETBACK_FT,
  };
}

export function maxAduSqFt(bedrooms: number, extraParking: number): number {
  const base = bedrooms >= 2 ? 1000 : 850;
  const bonus = Math.min(extraParking * 120, 120);
  return base + bonus;
}

export function getMaxAduSqFt(project: FeasibilityProject): number {
  return maxAduSqFt(
    project.intent.bedrooms,
    project.intent.extraParkingSpaces ?? 0
  );
}

export function getSitePlanSyncOptions(
  project: FeasibilityProject
): SitePlanSyncOptions {
  return {
    frontSetbackFt: project.property.frontSetbackFt,
    setbacks: getDefaultSetbacks(project),
    maxSqFt: getMaxAduSqFt(project),
    floorAreaContext: {
      property: project.property,
      intent: project.intent,
    },
  };
}

export function getEnvelopeRequirements(
  project: FeasibilityProject
): EnvelopeRequirement[] {
  const setbacks = getDefaultSetbacks(project);
  const frontLabel =
    project.property.frontSetbackFt !== undefined
      ? `${setbacks.frontFt}' (GIS / prevailing)`
      : `${DEFAULT_FRONT_SETBACK_FT}' default — confirm prevailing front yard`;

  const requirements: EnvelopeRequirement[] = [
    {
      id: "setback.front",
      label: "Front setback",
      value: frontLabel,
      citation: "BMC § 10-1-620.3(H)(2)",
      sourceUrl: ADU_HANDOUT,
    },
    {
      id: "setback.side",
      label: "Side setback (each)",
      value: `${setbacks.sideFt}' minimum`,
      citation: "BMC § 10-1-620.3(H)(1)",
      sourceUrl: ADU_HANDOUT,
    },
    {
      id: "setback.rear",
      label: "Rear setback",
      value: `${setbacks.rearFt}' minimum`,
      citation: "BMC § 10-1-620.3(H)(1)",
      sourceUrl: ADU_HANDOUT,
    },
    {
      id: "setback.separation_face",
      label: "Building separation (face-to-face)",
      value: `${MIN_SEPARATION_FACE_FT}' minimum`,
      citation: "BMC § 10-1-620.3(H)(4)",
      sourceUrl: ADU_HANDOUT,
    },
    {
      id: "setback.separation_eave",
      label: "Eave-to-eave separation",
      value: `${MIN_SEPARATION_EAVE_FT}' minimum`,
      citation: "BMC § 10-1-620.3(H)(4)",
      sourceUrl: ADU_HANDOUT,
    },
    {
      id: "access.egress",
      label: "Fire access / egress path",
      value: `${MIN_EGRESS_ACCESS_FT}' min clear side passage (plan-check)`,
      citation: "CBC egress; Burbank Fire plan review",
      sourceUrl: ADU_HANDOUT,
    },
    {
      id: "openspace.adu_exempt",
      label: "Open space (ADU)",
      value: "ADU exempt from base-zone open space — verify fire access if rear yard fully built",
      citation: "BMC § 10-1-620.3(F)(1)",
      sourceUrl: ADU_HANDOUT,
    },
  ];

  const { intent, property } = project;
  const types = intent.aduTypes.filter((t) => t !== "jadu");

  if (types.length === 0) {
    requirements.push({
      id: "height.default",
      label: "Max height (detached default)",
      value: "12' to plate / 17' to roof — select ADU type for exact limits",
      citation: "BMC § 10-1-620.3(G); ADU Handout",
      sourceUrl: ADU_HANDOUT,
    });
    requirements.push({
      id: "size.default",
      label: "Max ADU size",
      value: "850 sf (studio/1BR) or 1,000 sf (2+ BR) — select ADU type & bedrooms",
      citation: "BMC § 10-1-620.3(F)(2)",
      sourceUrl: ADU_HANDOUT,
    });
  } else {
    for (const type of types) {
      const h = getAduHeightLimits(type, property.overlays.nearHighQualityTransit);
      requirements.push({
        id: `height.${type}`,
        label: `Max height — ${h.label}`,
        value: `${h.plateFt}' to plate / ${h.roofFt}' to roof`,
        citation: "BMC § 10-1-620.3(G); ADU Handout",
        sourceUrl: ADU_HANDOUT,
      });
    }
    if (intent.aduTypes.includes("jadu")) {
      requirements.push({
        id: "size.jadu",
        label: "Max JADU size",
        value: "500 sq ft within existing primary envelope",
        citation: "ADU Handout — Junior ADU",
        sourceUrl: ADU_HANDOUT,
      });
    }
    if (types.length > 0) {
      const maxSqFt = maxAduSqFt(
        intent.bedrooms,
        intent.extraParkingSpaces ?? 0
      );
      requirements.push({
        id: "size.adu",
        label: "Max ADU size",
        value: `${maxSqFt} sq ft`,
        citation: "BMC § 10-1-620.3(F)(2)",
        sourceUrl: ADU_HANDOUT,
      });
    }
  }

  return requirements;
}
