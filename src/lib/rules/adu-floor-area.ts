import { computeMaxAduFootprint } from "../geometry/site-plan";
import type {
  AduFloorAreaAnalysis,
  AduFloorAreaByType,
  AduHeightLimits,
  AduType,
  SitePlanData,
  StoryPermitAnalysis,
} from "../types";

type SetbackDistances = { frontFt: number; sideFt: number; rearFt: number };

/** CBC minimum habitable room ceiling height (typical enforcement). */
export const MIN_HABITABLE_CEILING_FT = 7.5;
/** Conservative floor-to-floor height for stacked ADU stories (ceiling + structure). */
export const MIN_FLOOR_TO_FLOOR_FT = 9;

export type {
  AduFloorAreaAnalysis,
  AduFloorAreaByType,
  AduHeightLimits,
  StoryPermitAnalysis,
} from "../types";

export function getAduHeightLimits(
  type: AduType,
  nearHighQualityTransit: boolean
): AduHeightLimits {
  switch (type) {
    case "attached":
      return { label: "Attached ADU", plateFt: 20, roofFt: 30 };
    case "adu_on_garage":
      return { label: "ADU on garage/structure", plateFt: 20, roofFt: 23 };
    case "garage_conversion":
      return { label: "Garage conversion", plateFt: 20, roofFt: 23 };
    case "detached":
      if (nearHighQualityTransit) {
        return {
          label: "Detached ADU (near high-quality transit)",
          plateFt: 18,
          roofFt: 18,
        };
      }
      return { label: "Detached ADU (one story)", plateFt: 12, roofFt: 17 };
    case "jadu":
      return { label: "JADU (within primary envelope)", plateFt: 0, roofFt: 0 };
  }
}

export function analyzeStoryPermit(height: AduHeightLimits): StoryPermitAnalysis {
  if (height.plateFt <= 0 || height.roofFt <= 0) {
    return {
      maxStories: 1,
      singleStoryOnly: true,
      note: "JADU is within the existing primary dwelling envelope — not a separate footprint build.",
    };
  }

  const storiesByRoof = Math.floor(height.roofFt / MIN_FLOOR_TO_FLOOR_FT);
  const storiesByPlate = Math.floor(height.plateFt / MIN_FLOOR_TO_FLOOR_FT);
  const maxStories = Math.min(2, storiesByRoof, storiesByPlate) as 1 | 2;

  if (maxStories < 2) {
    return {
      maxStories: 1,
      singleStoryOnly: true,
      note:
        `Max ${height.roofFt}' to roof / ${height.plateFt}' to plate with ${MIN_FLOOR_TO_FLOOR_FT}' minimum floor-to-floor ` +
        `(CBC ${MIN_HABITABLE_CEILING_FT}' habitable ceiling) — only one story is feasible within height limits.`,
    };
  }

  return {
    maxStories: 2,
    singleStoryOnly: false,
    note:
      `Height limits (${height.plateFt}' plate / ${height.roofFt}' roof) may allow two stories at ` +
      `${MIN_FLOOR_TO_FLOOR_FT}' floor-to-floor — confirm plate/roof measuring points with Planning.`,
  };
}

function typesToAnalyze(
  aduTypes: AduType[],
  hasGarage: boolean
): AduType[] {
  if (aduTypes.length > 0) {
    return aduTypes.filter((t) => t !== "jadu");
  }

  const defaults: AduType[] = ["detached", "attached"];
  if (hasGarage) {
    defaults.push("adu_on_garage");
  }
  return defaults;
}

function analyzeTypeFloorArea(
  sitePlan: SitePlanData,
  setbacks: SetbackDistances,
  codeMaxSqFt: number,
  type: AduType,
  nearHighQualityTransit: boolean
): AduFloorAreaByType {
  const height = getAduHeightLimits(type, nearHighQualityTransit);
  const stories = analyzeStoryPermit(height);

  const singleFootprint = computeMaxAduFootprint(
    sitePlan,
    setbacks,
    codeMaxSqFt
  );
  const singleStoryFootprintSqFt = singleFootprint?.areaSqFt ?? 0;
  const maxSingleStoryTotalSqFt = Math.min(
    codeMaxSqFt,
    singleStoryFootprintSqFt
  );

  let maxTwoStoryTotalSqFt: number | null = null;
  let twoStoryFootprintSqFt: number | null = null;

  if (stories.maxStories >= 2) {
    const perFloorCap = Math.ceil(codeMaxSqFt / 2);
    const twoFootprint = computeMaxAduFootprint(
      sitePlan,
      setbacks,
      perFloorCap
    );
    twoStoryFootprintSqFt = twoFootprint?.areaSqFt ?? 0;
    maxTwoStoryTotalSqFt = Math.min(
      codeMaxSqFt,
      twoStoryFootprintSqFt * 2
    );
  }

  return {
    aduType: type,
    label: height.label,
    height,
    stories,
    codeMaxSqFt,
    maxSingleStoryTotalSqFt,
    singleStoryFootprintSqFt,
    maxTwoStoryTotalSqFt,
    twoStoryFootprintSqFt,
  };
}

export function analyzeAduFloorArea(
  sitePlan: SitePlanData,
  options: {
    setbacks: SetbackDistances;
    codeMaxSqFt: number;
    aduTypes: AduType[];
    hasGarage: boolean;
    nearHighQualityTransit: boolean;
  }
): AduFloorAreaAnalysis | null {
  if (!sitePlan.parcelGeoJson) return null;

  const types = typesToAnalyze(options.aduTypes, options.hasGarage);

  const byType = types.map((type) =>
    analyzeTypeFloorArea(
      sitePlan,
      options.setbacks,
      options.codeMaxSqFt,
      type,
      options.nearHighQualityTransit
    )
  );

  return {
    codeMaxSqFt: options.codeMaxSqFt,
    minFloorToFloorFt: MIN_FLOOR_TO_FLOOR_FT,
    minHabitableCeilingFt: MIN_HABITABLE_CEILING_FT,
    byType,
  };
}

export function buildFloorAreaDesignNotes(
  analysis: AduFloorAreaAnalysis
): string[] {
  const notes: string[] = [];
  const primary = analysis.byType[0];
  if (!primary) return notes;

  notes.push(
    `Code max ${analysis.codeMaxSqFt} sf total floor area — single-story site max ` +
      `${primary.maxSingleStoryTotalSqFt} sf (${primary.singleStoryFootprintSqFt} sf footprint).`
  );

  if (primary.stories.singleStoryOnly) {
    notes.push(primary.stories.note ?? "Only one story permitted within height limits.");
  } else if (primary.maxTwoStoryTotalSqFt !== null) {
    notes.push(
      `If two stories are permitted (${primary.height.plateFt}' plate / ${primary.height.roofFt}' roof), ` +
        `site max rises to ${primary.maxTwoStoryTotalSqFt} sf ` +
        `(${primary.twoStoryFootprintSqFt} sf footprint × 2, capped at code max).`
    );
  }

  const multiType = analysis.byType.length > 1;
  if (multiType) {
    for (const row of analysis.byType.slice(1)) {
      if (row.stories.singleStoryOnly) {
        notes.push(
          `${row.label}: single-story only — max ${row.maxSingleStoryTotalSqFt} sf on site.`
        );
      } else if (row.maxTwoStoryTotalSqFt !== null) {
        notes.push(
          `${row.label}: up to ${row.maxTwoStoryTotalSqFt} sf if two stories (${row.twoStoryFootprintSqFt} sf footprint × 2).`
        );
      }
    }
  }

  return notes;
}
