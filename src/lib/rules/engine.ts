import type {
  AduType,
  BurbankZone,
  FeasibilityProject,
  FindingStatus,
  PermitStep,
  RuleFinding,
} from "../types";
import {
  MIN_EGRESS_ACCESS_FT,
  MIN_SEPARATION_FACE_FT,
  MIN_SIDE_SETBACK_FT,
  MIN_REAR_SETBACK_FT,
  BUILDABLE_CONSUMED_WARN_PCT,
} from "./envelope-requirements";
import {
  analyzeStoryPermit,
  getAduHeightLimits,
  MIN_FLOOR_TO_FLOOR_FT,
  MIN_HABITABLE_CEILING_FT,
} from "./adu-floor-area";
import { inferLikelyNewDriveway, treeProtectionScreeningSummary } from "@/lib/gis/curb-cut-inference";

const ADU_ZONES: BurbankZone[] = [
  "R-1",
  "R-1-H",
  "R2",
  "R3",
  "R4",
  "MDR-3",
  "MDR-4",
];

const JADU_ZONES: BurbankZone[] = ["R-1", "R-1-H"];

const ADU_HANDOUT =
  "https://www.burbankca.gov/documents/d/community-development/adu-handout-updated-7-11-2024";

function finding(
  partial: Omit<RuleFinding, "confidence"> & { confidence?: RuleFinding["confidence"] }
): RuleFinding {
  return { confidence: "verified", ...partial };
}

function maxAduSqFt(bedrooms: number, extraParking: number): number {
  const base = bedrooms >= 2 ? 1000 : 850;
  const bonus = Math.min(extraParking * 120, 120);
  return base + bonus;
}

function parkingRequired(project: FeasibilityProject): boolean {
  const { property, intent } = project;
  if (intent.aduTypes.includes("jadu")) return false;
  if (intent.aduTypes.every((t) => t === "jadu")) return false;

  const exempt =
    property.overlays.nearPublicTransitHalfMile ||
    property.overlays.permitParkingDistrict ||
    property.overlays.historicDistrict ||
    intent.isConversion ||
    intent.aduTypes.includes("garage_conversion");

  return !exempt;
}

function evaluateEligibility(project: FeasibilityProject): RuleFinding[] {
  const { property, intent } = project;
  const findings: RuleFinding[] = [];
  const zone = property.zone;

  const aduAllowed = ADU_ZONES.includes(zone) || zone === "OTHER";
  findings.push(
    finding({
      id: "eligibility.zone",
      category: "Eligibility",
      status: aduAllowed ? "pass" : "fail",
      summary: aduAllowed
        ? `ADUs permitted in ${zone} zone`
        : `Zone ${zone} requires verification — ADU may not be permitted`,
      detail:
        "ADUs and JADUs are permitted in R-1, R-1-H, R2, R3, R4, MDR-3, and MDR-4 per BMC § 10-1-620.3(B)(1).",
      citation: {
        citation: "BMC § 10-1-620.3(B)(1)",
        sourceUrl: ADU_HANDOUT,
        effectiveDate: "2024-07-11",
      },
      blocking: !aduAllowed,
    })
  );

  if (!property.hasPrimaryDwelling) {
    findings.push(
      finding({
        id: "eligibility.primary",
        category: "Eligibility",
        status: "warning",
        summary: "No existing primary dwelling — primary must be approved before ADU",
        citation: {
          citation: "BMC § 10-1-620.3(B)(2)",
          sourceUrl: ADU_HANDOUT,
        },
        blocking: false,
      })
    );
  }

  if (
    property.overlays.mountainFireZone ||
    property.overlays.r1hHillside ||
    property.zone === "R-1-H"
  ) {
    findings.push(
      finding({
        id: "eligibility.count_limit",
        category: "Eligibility",
        status: "warning",
        summary:
          "Mountain Fire Zone / R-1-H: only one ADU or one JADU allowed (not both)",
        citation: {
          citation: "ADU Handout — Mountain Fire Zone / R-1-H",
          sourceUrl: ADU_HANDOUT,
        },
        blocking: false,
        computed: {
          mountainFireZone: property.overlays.mountainFireZone,
          r1h: property.zone === "R-1-H",
        },
      })
    );
  }

  if (intent.aduTypes.includes("jadu")) {
    const jaduOk = JADU_ZONES.includes(zone);
    findings.push(
      finding({
        id: "eligibility.jadu_zone",
        category: "Eligibility",
        status: jaduOk ? "pass" : "fail",
        summary: jaduOk
          ? "JADU allowed in R-1 / R-1-H"
          : "JADU only permitted within R-1 or R-1-H",
        citation: {
          citation: "ADU Handout — Junior ADU",
          sourceUrl: ADU_HANDOUT,
        },
        blocking: !jaduOk,
      })
    );
  }

  findings.push(
    finding({
      id: "eligibility.review_type",
      category: "Eligibility",
      status: "info",
      summary: "Ministerial review — 60-day clock when application deemed complete",
      citation: {
        citation: "BMC § 10-1-620.3(A)",
        sourceUrl: ADU_HANDOUT,
      },
      blocking: false,
    })
  );

  return findings;
}

function evaluateSize(project: FeasibilityProject): RuleFinding[] {
  const { intent, envelope } = project;
  const findings: RuleFinding[] = [];

  if (intent.aduTypes.length === 0) return findings;

  if (intent.aduTypes.includes("jadu")) {
    findings.push(
      finding({
        id: "size.jadu_max",
        category: "Size",
        status: "info",
        summary: "JADU maximum 500 sq ft within existing single-family envelope",
        citation: {
          citation: "ADU Handout — Junior ADU",
          sourceUrl: ADU_HANDOUT,
        },
        computed: { maxSqFt: 500 },
        blocking: false,
      })
    );
  }

  const nonJadu = intent.aduTypes.filter((t) => t !== "jadu");
  if (nonJadu.length > 0) {
    const maxSqFt = maxAduSqFt(intent.bedrooms, intent.extraParkingSpaces ?? 0);
    const proposed = envelope.proposedSqFt ?? intent.targetSqFt;
    let status: FindingStatus = "info";
    if (proposed !== undefined) {
      status = proposed <= maxSqFt ? "pass" : "fail";
    }

    findings.push(
      finding({
        id: "size.adu_max",
        category: "Size",
        status,
        summary: `Max ADU size: ${maxSqFt} sq ft (${intent.bedrooms >= 2 ? "2+ BR" : "studio/1BR"}${(intent.extraParkingSpaces ?? 0) > 0 ? " + parking bonus" : ""})`,
        detail:
          "850 sf for studio/1BR; 1,000 sf for 2+ BR. Up to 120 sf bonus with deed-restricted extra parking beyond minimum.",
        citation: {
          citation: "BMC § 10-1-620.3(F)(2)",
          sourceUrl: ADU_HANDOUT,
        },
        computed: { maxSqFt, proposedSqFt: proposed ?? "not_set" },
        blocking: status === "fail",
      })
    );

    findings.push(
      finding({
        id: "size.far_exempt",
        category: "Size",
        status: "pass",
        summary: "ADUs exempt from FAR, lot coverage, open space, and minimum lot size",
        citation: {
          citation: "BMC § 10-1-620.3(F)(1)",
          sourceUrl: ADU_HANDOUT,
        },
        blocking: false,
      })
    );
  }

  return findings;
}

function evaluateSetbacks(project: FeasibilityProject): RuleFinding[] {
  const { intent, envelope } = project;
  const findings: RuleFinding[] = [];

  if (intent.aduTypes.length === 0) return findings;
  if (intent.aduTypes.every((t) => t === "jadu")) return findings;

  if (intent.isConversion && intent.sameFootprintConversion) {
    findings.push(
      finding({
        id: "setback.conversion",
        category: "Setbacks",
        status: "pass",
        summary: "Conversion in same footprint — no new setback required",
        citation: {
          citation: "BMC § 10-1-620.3(H)(6)",
          sourceUrl: ADU_HANDOUT,
        },
        blocking: false,
      })
    );
    return findings;
  }

  const minSide = 4;
  const minRear = 4;

  findings.push(
    finding({
      id: "setback.side_rear",
      category: "Setbacks",
      status: "info",
      summary: `Minimum ${minSide}' side and ${minRear}' rear setbacks for new attached/detached ADUs`,
      citation: {
        citation: "BMC § 10-1-620.3(H)(1)",
        sourceUrl: ADU_HANDOUT,
      },
      computed: { minSideFt: minSide, minRearFt: minRear },
      blocking: false,
    })
  );

  if (envelope.sideSetbackFt !== undefined) {
    findings.push(
      finding({
        id: "setback.side_check",
        category: "Setbacks",
        status: envelope.sideSetbackFt >= minSide ? "pass" : "fail",
        summary: `Proposed side setback: ${envelope.sideSetbackFt.toFixed(1)}' (min ${minSide}')`,
        citation: {
          citation: "BMC § 10-1-620.3(H)(1)",
          sourceUrl: ADU_HANDOUT,
        },
        blocking: envelope.sideSetbackFt < minSide,
      })
    );
  }

  if (envelope.rearSetbackFt !== undefined) {
    findings.push(
      finding({
        id: "setback.rear_check",
        category: "Setbacks",
        status: envelope.rearSetbackFt >= minRear ? "pass" : "fail",
        summary: `Proposed rear setback: ${envelope.rearSetbackFt.toFixed(1)}' (min ${minRear}')`,
        citation: {
          citation: "BMC § 10-1-620.3(H)(1)",
          sourceUrl: ADU_HANDOUT,
        },
        blocking: envelope.rearSetbackFt < minRear,
      })
    );
  }

  findings.push(
    finding({
      id: "setback.separation",
      category: "Setbacks",
      status: "info",
      summary:
        "5' building-face separation and 4' eave-to-eave from adjacent structures (unless physically infeasible for 800 sf ADU elsewhere)",
      citation: {
        citation: "BMC § 10-1-620.3(H)(4)",
        sourceUrl: ADU_HANDOUT,
      },
      blocking: false,
    })
  );

  if (envelope.separationFromPrimaryFt !== undefined) {
    findings.push(
      finding({
        id: "setback.separation_check",
        category: "Setbacks",
        status: envelope.separationFromPrimaryFt >= 5 ? "pass" : "fail",
        summary: `Separation from primary: ${envelope.separationFromPrimaryFt.toFixed(1)}' (min 5' face-to-face)`,
        citation: {
          citation: "BMC § 10-1-620.3(H)(4)",
          sourceUrl: ADU_HANDOUT,
        },
        blocking: envelope.separationFromPrimaryFt < 5,
      })
    );
  }

  if (envelope.separationFromGarageFt !== undefined && envelope.separationFromGarageFt > 0) {
    findings.push(
      finding({
        id: "setback.garage_separation_check",
        category: "Setbacks",
        status:
          envelope.separationFromGarageFt >= MIN_SEPARATION_FACE_FT ? "pass" : "fail",
        summary: `Separation from garage: ${envelope.separationFromGarageFt.toFixed(1)}' (min ${MIN_SEPARATION_FACE_FT}' face-to-face)`,
        citation: {
          citation: "BMC § 10-1-620.3(H)(4)",
          sourceUrl: ADU_HANDOUT,
        },
        blocking: envelope.separationFromGarageFt < MIN_SEPARATION_FACE_FT,
      })
    );
  }

  findings.push(
    finding({
      id: "setback.front",
      category: "Setbacks",
      status: "needs_verification",
      summary:
        "Front setback: ADU cannot be closer to front property line than prevailing front yard for zone",
      detail:
        "Exception: front-yard build allowed if City determines it is physically infeasible to build 800 sf ADU elsewhere with 2' side/rear setbacks.",
      citation: {
        citation: "BMC § 10-1-620.3(H)(2)",
        sourceUrl: ADU_HANDOUT,
      },
      confidence: "verified",
      blocking: false,
    })
  );

  return findings;
}

function evaluateMapEnvelope(project: FeasibilityProject): RuleFinding[] {
  const { envelope, sitePlan } = project;
  const findings: RuleFinding[] = [];

  if (!sitePlan.parcelGeoJson || envelope.remainingBuildableSqFt === undefined) {
    return findings;
  }

  findings.push(
    finding({
      id: "map.loaded",
      category: "Site Map",
      status: "info",
      summary:
        "Parcel geometry loaded — buildable zone is setback envelope minus existing structures; max ADU footprint applies 5' separation and egress checks",
      citation: {
        citation: "LA County Assessor parcel + BMC § 10-1-620.3(H)(4)",
      },
      confidence: sitePlan.lookupSource === "lacounty_assessor" ? "verified" : "user_provided",
      blocking: false,
    })
  );

  if (envelope.mapSideSetbackFt !== undefined) {
    findings.push(
      finding({
        id: "map.side_setback",
        category: "Site Map",
        status: envelope.mapSideSetbackFt >= MIN_SIDE_SETBACK_FT ? "pass" : "fail",
        summary: `Map side setback: ${envelope.mapSideSetbackFt.toFixed(1)}' (min ${MIN_SIDE_SETBACK_FT}')`,
        citation: { citation: "BMC § 10-1-620.3(H)(1)", sourceUrl: ADU_HANDOUT },
        computed: { measuredFt: envelope.mapSideSetbackFt },
        confidence: "inferred",
        blocking: envelope.mapSideSetbackFt < MIN_SIDE_SETBACK_FT,
      })
    );
  }

  if (envelope.mapRearSetbackFt !== undefined) {
    findings.push(
      finding({
        id: "map.rear_setback",
        category: "Site Map",
        status: envelope.mapRearSetbackFt >= MIN_REAR_SETBACK_FT ? "pass" : "fail",
        summary: `Map rear setback: ${envelope.mapRearSetbackFt.toFixed(1)}' (min ${MIN_REAR_SETBACK_FT}')`,
        citation: { citation: "BMC § 10-1-620.3(H)(1)", sourceUrl: ADU_HANDOUT },
        computed: { measuredFt: envelope.mapRearSetbackFt },
        confidence: "inferred",
        blocking: envelope.mapRearSetbackFt < MIN_REAR_SETBACK_FT,
      })
    );
  }

  if (envelope.mapSeparationFt !== undefined && envelope.mapSeparationFt > 0) {
    findings.push(
      finding({
        id: "map.separation",
        category: "Site Map",
        status: envelope.mapSeparationFt >= MIN_SEPARATION_FACE_FT ? "pass" : "fail",
        summary: `Map separation from primary: ${envelope.mapSeparationFt.toFixed(1)}' (min ${MIN_SEPARATION_FACE_FT}')`,
        citation: { citation: "BMC § 10-1-620.3(H)(4)", sourceUrl: ADU_HANDOUT },
        computed: { measuredFt: envelope.mapSeparationFt },
        confidence: "inferred",
        blocking: envelope.mapSeparationFt < MIN_SEPARATION_FACE_FT,
      })
    );
  }

  if (
    envelope.mapSeparationFromGarageFt !== undefined &&
    envelope.mapSeparationFromGarageFt > 0
  ) {
    findings.push(
      finding({
        id: "map.garage_separation",
        category: "Site Map",
        status:
          envelope.mapSeparationFromGarageFt >= MIN_SEPARATION_FACE_FT
            ? "pass"
            : "fail",
        summary: `Map separation from garage: ${envelope.mapSeparationFromGarageFt.toFixed(1)}' (min ${MIN_SEPARATION_FACE_FT}')`,
        citation: { citation: "BMC § 10-1-620.3(H)(4)", sourceUrl: ADU_HANDOUT },
        computed: { measuredFt: envelope.mapSeparationFromGarageFt },
        confidence: "inferred",
        blocking: envelope.mapSeparationFromGarageFt < MIN_SEPARATION_FACE_FT,
      })
    );
  }

  if (
    envelope.mapMinStructureSeparationFt !== undefined &&
    envelope.mapMinStructureSeparationFt > 0
  ) {
    findings.push(
      finding({
        id: "map.min_separation",
        category: "Site Map",
        status:
          envelope.mapMinStructureSeparationFt >= MIN_SEPARATION_FACE_FT
            ? "pass"
            : "fail",
        summary: `Closest structure separation: ${envelope.mapMinStructureSeparationFt.toFixed(1)}' (min ${MIN_SEPARATION_FACE_FT}')`,
        citation: { citation: "BMC § 10-1-620.3(H)(4)", sourceUrl: ADU_HANDOUT },
        computed: { measuredFt: envelope.mapMinStructureSeparationFt },
        confidence: "inferred",
        blocking: envelope.mapMinStructureSeparationFt < MIN_SEPARATION_FACE_FT,
      })
    );
  }

  if (
    envelope.minAccessPassageFt !== undefined &&
    Number.isFinite(envelope.minAccessPassageFt)
  ) {
    findings.push(
      finding({
        id: "map.access_passage",
        category: "Site Map",
        status:
          envelope.minAccessPassageFt >= MIN_EGRESS_ACCESS_FT ? "pass" : "warning",
        summary: `Side access passage: ${envelope.minAccessPassageFt.toFixed(1)}' (recommend ${MIN_EGRESS_ACCESS_FT}'+ for fire access / egress)`,
        citation: { citation: "CBC egress; Burbank Fire plan review", sourceUrl: ADU_HANDOUT },
        computed: { measuredFt: envelope.minAccessPassageFt },
        confidence: "inferred",
        blocking: false,
      })
    );
  }

  if (envelope.buildableConsumedPct !== undefined) {
    findings.push(
      finding({
        id: "map.buildable_consumed",
        category: "Site Map",
        status:
          envelope.buildableConsumedPct >= BUILDABLE_CONSUMED_WARN_PCT
            ? "warning"
            : "info",
        summary: `Max ADU consumes ${envelope.buildableConsumedPct.toFixed(0)}% of net buildable area (${Math.round(envelope.remainingBuildableSqFt ?? 0)} sf remaining)`,
        detail:
          "ADUs are exempt from base-zone open space, but fully building the rear yard may affect fire access and usable outdoor area.",
        citation: { citation: "BMC § 10-1-620.3(F)(1)", sourceUrl: ADU_HANDOUT },
        computed: {
          consumedPct: envelope.buildableConsumedPct,
          remainingSqFt: envelope.remainingBuildableSqFt ?? 0,
        },
        confidence: "inferred",
        blocking: false,
      })
    );
  }

  for (const w of envelope.mapDesignWarnings ?? []) {
    findings.push(
      finding({
        id: `map.design.${w.slice(0, 24)}`,
        category: "Site Map",
        status: "warning",
        summary: w,
        citation: { citation: "Site plan design analysis" },
        confidence: "inferred",
        blocking: false,
      })
    );
  }

  for (const v of envelope.mapViolations ?? []) {
    if (
      v.startsWith("Side setback") ||
      v.startsWith("Rear setback") ||
      v.startsWith("Primary separation") ||
      v.startsWith("Garage separation") ||
      v.startsWith("Front setback")
    ) {
      continue;
    }
    findings.push(
      finding({
        id: `map.violation.${v.slice(0, 20)}`,
        category: "Site Map",
        status: "fail",
        summary: v,
        citation: { citation: "Site plan geometry analysis" },
        confidence: "inferred",
        blocking: true,
      })
    );
  }

  return findings;
}

function evaluateFloorArea(project: FeasibilityProject): RuleFinding[] {
  const analysis = project.envelope.floorAreaAnalysis;
  if (!analysis || analysis.byType.length === 0) return [];

  const findings: RuleFinding[] = [];
  const primary = analysis.byType[0];

  findings.push(
    finding({
      id: "size.site_single_story",
      category: "Size",
      status:
        primary.maxSingleStoryTotalSqFt >= analysis.codeMaxSqFt
          ? "pass"
          : primary.maxSingleStoryTotalSqFt < analysis.codeMaxSqFt * 0.5
            ? "warning"
            : "info",
      summary: `Single-story site max: ${primary.maxSingleStoryTotalSqFt} sf (${primary.singleStoryFootprintSqFt} sf footprint)`,
      detail:
        `Code allows ${analysis.codeMaxSqFt} sf total. Largest one-story placement on this lot ` +
        `(setbacks, 5' separation, egress) is ${primary.maxSingleStoryTotalSqFt} sf.`,
      citation: {
        citation: "BMC § 10-1-620.3(F)(2); site plan geometry",
        sourceUrl: ADU_HANDOUT,
      },
      computed: {
        codeMaxSqFt: analysis.codeMaxSqFt,
        footprintSqFt: primary.singleStoryFootprintSqFt,
        totalSqFt: primary.maxSingleStoryTotalSqFt,
      },
      confidence: "inferred",
      blocking: false,
    })
  );

  if (primary.stories.singleStoryOnly) {
    findings.push(
      finding({
        id: "height.single_story_only",
        category: "Height",
        status: "info",
        summary: `${primary.label}: only one story within height limits`,
        detail: primary.stories.note,
        citation: {
          citation: `BMC § 10-1-620.3(G); CBC ${MIN_HABITABLE_CEILING_FT}' min ceiling; ${MIN_FLOOR_TO_FLOOR_FT}' floor-to-floor heuristic`,
          sourceUrl: ADU_HANDOUT,
        },
        computed: {
          maxPlateFt: primary.height.plateFt,
          maxRoofFt: primary.height.roofFt,
          maxStories: 1,
        },
        confidence: "inferred",
        blocking: false,
      })
    );
  } else if (primary.maxTwoStoryTotalSqFt !== null) {
    findings.push(
      finding({
        id: "size.site_two_story",
        category: "Size",
        status:
          primary.maxTwoStoryTotalSqFt >= analysis.codeMaxSqFt
            ? "pass"
            : "info",
        summary: `Two-story site max: ${primary.maxTwoStoryTotalSqFt} sf (${primary.twoStoryFootprintSqFt} sf footprint × 2)`,
        detail:
          `${primary.height.plateFt}' plate / ${primary.height.roofFt}' roof may allow two stories at ` +
          `${MIN_FLOOR_TO_FLOOR_FT}' floor-to-floor — confirm with Planning before relying on stacked area.`,
        citation: {
          citation: "BMC § 10-1-620.3(G); site plan geometry",
          sourceUrl: ADU_HANDOUT,
        },
        computed: {
          footprintSqFt: primary.twoStoryFootprintSqFt ?? 0,
          totalSqFt: primary.maxTwoStoryTotalSqFt,
          maxStories: 2,
        },
        confidence: "inferred",
        blocking: false,
      })
    );
  }

  for (const row of analysis.byType.slice(1)) {
    findings.push(
      finding({
        id: `size.site_floor_area.${row.aduType}`,
        category: "Size",
        status: "info",
        summary: `${row.label}: ${row.maxSingleStoryTotalSqFt} sf single-story site max${
          row.maxTwoStoryTotalSqFt !== null
            ? `; up to ${row.maxTwoStoryTotalSqFt} sf if two stories`
            : " (one story only)"
        }`,
        detail: row.stories.singleStoryOnly ? row.stories.note : undefined,
        citation: {
          citation: "BMC § 10-1-620.3(G)(F); site plan geometry",
          sourceUrl: ADU_HANDOUT,
        },
        computed: {
          singleStorySqFt: row.maxSingleStoryTotalSqFt,
          twoStorySqFt: row.maxTwoStoryTotalSqFt ?? "n/a",
        },
        confidence: "inferred",
        blocking: false,
      })
    );
  }

  return findings;
}

function evaluateHeight(project: FeasibilityProject): RuleFinding[] {
  const { intent, property, envelope } = project;
  const findings: RuleFinding[] = [];

  const types = intent.aduTypes.filter((t) => t !== "jadu");
  if (types.length === 0) return findings;

  for (const type of types) {
    const { label, plateFt: maxPlate, roofFt: maxRoof } = getAduHeightLimits(
      type,
      property.overlays.nearHighQualityTransit
    );
    const stories = analyzeStoryPermit({ label, plateFt: maxPlate, roofFt: maxRoof });

    let status: FindingStatus = "info";
    if (envelope.proposedHeightFt !== undefined) {
      status = envelope.proposedHeightFt <= maxRoof ? "pass" : "fail";
    }

    findings.push(
      finding({
        id: `height.${type}`,
        category: "Height",
        status,
        summary: `${label}: max ${maxPlate}' to plate, ${maxRoof}' to roof/features`,
        detail: stories.note,
        citation: {
          citation: "BMC § 10-1-620.3(G); ADU Handout",
          sourceUrl: ADU_HANDOUT,
        },
        computed: {
          maxPlateFt: maxPlate,
          maxRoofFt: maxRoof,
          maxStories: stories.maxStories,
          proposedFt: envelope.proposedHeightFt ?? "not_set",
        },
        blocking: status === "fail",
      })
    );
  }

  return findings;
}

function evaluateParking(project: FeasibilityProject): RuleFinding[] {
  const { intent } = project;
  const findings: RuleFinding[] = [];

  if (intent.aduTypes.length === 0) return findings;

  if (intent.aduTypes.includes("jadu") && intent.aduTypes.length === 1) {
    findings.push(
      finding({
        id: "parking.jadu",
        category: "Parking",
        status: "pass",
        summary: "No parking required for JADU",
        citation: {
          citation: "ADU Handout — Junior ADU",
          sourceUrl: ADU_HANDOUT,
        },
        blocking: false,
      })
    );
    return findings;
  }

  const required = parkingRequired(project);
  findings.push(
    finding({
      id: "parking.requirement",
      category: "Parking",
      status: required ? "warning" : "pass",
      summary: required
        ? "1 parking space required (per ADU or per bedroom, whichever is less)"
        : "Parking exempt — transit half-mile, permit district, conversion, or historic district",
      citation: {
        citation: "BMC § 10-1-620.3(C–E); Gov. Code § 65852.2",
        sourceUrl: ADU_HANDOUT,
      },
      blocking: false,
    })
  );

  if (intent.isConversion || intent.aduTypes.includes("garage_conversion")) {
    findings.push(
      finding({
        id: "parking.conversion",
        category: "Parking",
        status: "pass",
        summary: "Garage demolition/conversion — replacement parking not required for primary",
        citation: {
          citation: "BMC § 10-1-620.3(C)(2)",
          sourceUrl: ADU_HANDOUT,
        },
        blocking: false,
      })
    );
  }

  return findings;
}

function evaluateConstraints(project: FeasibilityProject): RuleFinding[] {
  const { constraints, property } = project;
  const findings: RuleFinding[] = [];
  const hasParcel = property.gisVerified || !!project.sitePlan.parcelGeoJson;
  const hillside =
    property.overlays.r1hHillside ||
    property.zone === "R-1-H" ||
    property.overlays.mountainFireZone;

  if (hasParcel) {
    findings.push(
      finding({
        id: "site.primary",
        category: "Site",
        status: property.hasPrimaryDwelling ? "pass" : "warning",
        summary: property.hasPrimaryDwelling
          ? "Primary dwelling on lot (Assessor / GIS)"
          : "No primary dwelling detected — must be approved before ADU",
        citation: {
          citation: "BMC § 10-1-620.3(B)(2)",
          sourceUrl: ADU_HANDOUT,
        },
        confidence: "inferred",
        blocking: false,
      })
    );

    findings.push(
      finding({
        id: "site.garage",
        category: "Site",
        status: "info",
        summary: property.hasGarage
          ? "Garage or accessory structure on lot (GIS site plan)"
          : "No garage footprint — detached or attached new construction likely",
        citation: { citation: "LARIAC / site plan footprints" },
        confidence: "inferred",
        blocking: false,
      })
    );
  }

  if (property.garageInFrontYard && property.hasGarage) {
    findings.push(
      finding({
        id: "site.front_yard_garage",
        category: "Site",
        status: "warning",
        summary:
          "Street-facing / front-yard garage — front-yard ADU or conversion needs City plan review",
        citation: {
          citation: "ADU Handout — front yard placement",
          sourceUrl: ADU_HANDOUT,
        },
        confidence: "inferred",
        blocking: false,
      })
    );
  }

  if (property.overlays.mountainFireZone || property.zone === "R-1-H") {
    findings.push(
      finding({
        id: "site.count_limit",
        category: "Site",
        status: "warning",
        summary:
          "Mountain Fire Zone / R-1-H: only one ADU or one JADU allowed (not both)",
        citation: {
          citation: "ADU Handout — Mountain Fire Zone / R-1-H",
          sourceUrl: ADU_HANDOUT,
        },
        confidence: property.overlays.mountainFireZone ? "inferred" : "verified",
        blocking: false,
      })
    );
  }

  if (hillside) {
    findings.push(
      finding({
        id: "site.fire_hillside",
        category: "Site",
        status: "warning",
        summary:
          "Mountain Fire / R-1-H hillside — WUI, brush clearance, and hillside standards apply",
        citation: {
          citation: "BMC Fire Code; ADU Handout; R-1-H overlay",
          sourceUrl: ADU_HANDOUT,
        },
        confidence: "inferred",
        blocking: false,
      })
    );
  }

  if (hasParcel) {
    findings.push(
      finding({
        id: "site.transit_parking",
        category: "Site",
        status: property.overlays.nearPublicTransitHalfMile ? "pass" : "info",
        summary: property.overlays.nearPublicTransitHalfMile
          ? "Within ½ mile of public transit — ADU parking exemption likely (GIS)"
          : "No transit half-mile detected — assume 1 parking space unless other exemption applies",
        citation: {
          citation: "Gov. Code § 65852.2; BMC § 10-1-620.3(C–E)",
          sourceUrl: ADU_HANDOUT,
        },
        confidence: "inferred",
        blocking: false,
      })
    );

    findings.push(
      finding({
        id: "site.transit_height",
        category: "Site",
        status: property.overlays.nearHighQualityTransit ? "pass" : "info",
        summary: property.overlays.nearHighQualityTransit
          ? "Near high-quality transit — detached ADU height up to 18' (GIS)"
          : "Standard detached height: 12' plate / 17' roof unless near HQ transit corridor",
        citation: {
          citation: "BMC § 10-1-620.3(G); ADU Handout",
          sourceUrl: ADU_HANDOUT,
        },
        confidence: "inferred",
        blocking: false,
      })
    );

    findings.push(
      finding({
        id: "site.permit_parking",
        category: "Site",
        status: property.overlays.permitParkingDistrict
          ? "pass"
          : hasParcel
            ? "pass"
            : "needs_verification",
        summary: property.overlays.permitParkingDistrict
          ? property.overlays.permitParkingZone
            ? `Residential permit parking Zone ${property.overlays.permitParkingZone} — ADU parking exempt (GIS street match)`
            : "Residential permit parking district — ADU parking exempt"
          : hasParcel
            ? "No permit parking street match — verify City zone map if street has time limits"
            : "Permit parking district not detected — verify City zone map if street has time limits",
        citation: {
          citation: "BMC § 10-1-620.3(C); City permit zone map",
          sourceUrl:
            "https://www.burbankca.gov/web/community-development/residential-parking-permit",
        },
        confidence: property.overlays.permitParkingDistrict
          ? "inferred"
          : hasParcel
            ? "inferred"
            : "inferred",
        blocking: false,
      })
    );

    findings.push(
      finding({
        id: "site.historic",
        category: "Site",
        status: property.overlays.historicDistrict
          ? "warning"
          : "needs_verification",
        summary: property.overlays.historicDistrict
          ? property.overlays.historicResourceName
            ? `Historic resource: ${property.overlays.historicResourceName} — design review and parking exemption may apply`
            : "Historic resource on or near parcel — design review and parking exemption may apply"
          : hasParcel
            ? "No historic resource detected — confirm with Planning for design review triggers"
            : "Historic district not detected — confirm with Planning for design review triggers",
        citation: {
          citation: "BMC § 10-1-620.3; Historic Preservation; LA County GISNET",
          sourceUrl: ADU_HANDOUT,
        },
        confidence: property.overlays.historicDistrict ? "inferred" : "inferred",
        blocking: false,
      })
    );
  }

  const treeScreening = treeProtectionScreeningSummary(project);
  if (treeScreening.flagged) {
    findings.push(
      finding({
        id: "site.trees_gis",
        category: "Site",
        status: "needs_verification",
        summary: treeScreening.value,
        citation: {
          citation: "BMC Title 7 Ch. 4; LA County street trees / LARIAC canopy",
          sourceUrl: ADU_HANDOUT,
        },
        confidence: "inferred",
        blocking: false,
      })
    );
  } else if (hasParcel) {
    findings.push(
      finding({
        id: "site.tree_baseline",
        category: "Site",
        status: "pass",
        summary:
          "No street trees or canopy flagged on parcel — confirm protected trees if work affects parkway",
        citation: {
          citation: "BMC Title 7 Ch. 4; § 10-1-620.3(C)(5)",
          sourceUrl: ADU_HANDOUT,
        },
        confidence: "inferred",
        blocking: false,
      })
    );
  } else {
    findings.push(
      finding({
        id: "site.tree_baseline",
        category: "Site",
        status: "info",
        summary:
          "Tree protection (BMC Title 7 Ch. 4) applies if work affects protected trees or new curb cuts",
        citation: {
          citation: "BMC Title 7 Ch. 4; § 10-1-620.3(C)(5)",
          sourceUrl: ADU_HANDOUT,
        },
        blocking: false,
      })
    );
  }

  const curbCutHint = inferLikelyNewDriveway(project);
  if (constraints.newDrivewayOrCurbCut) {
    findings.push(
      finding({
        id: "site.curb_cut",
        category: "Site",
        status: "needs_verification",
        summary:
          "New driveway or curb cut proposed — tree protection and Public Works review may apply",
        citation: {
          citation: "BMC Title 7 Ch. 4; site plan",
          sourceUrl: ADU_HANDOUT,
        },
        confidence: "user_provided",
        blocking: false,
      })
    );
  } else if (curbCutHint.likely && curbCutHint.reason) {
    findings.push(
      finding({
        id: "site.curb_cut_hint",
        category: "Site",
        status: "needs_verification",
        summary: curbCutHint.reason,
        citation: {
          citation: "Site plan / ADU type screening",
          sourceUrl: ADU_HANDOUT,
        },
        confidence: "inferred",
        blocking: false,
      })
    );
  }

  if (property.overlays.unpermittedStructureRisk) {
    findings.push(
      finding({
        id: "site.unpermitted_gis",
        category: "Site",
        status: "warning",
        summary:
          property.overlays.unpermittedStructureNote ??
          "LARIAC vs Assessor footprint discrepancy — verify all structures are permitted",
        citation: {
          citation: "Planning pre-clearance review; LARIAC vs Assessor",
          sourceUrl:
            "https://www.burbankca.gov/web/community-development/plan-check-review",
        },
        confidence: "inferred",
        blocking: false,
      })
    );
  }

  if (constraints.unpermittedStructures) {
    findings.push(
      finding({
        id: "site.unpermitted",
        category: "Site",
        status: "warning",
        summary: "Unpermitted structures on lot — resolve before or during permit process",
        citation: {
          citation: "Planning pre-clearance review",
          sourceUrl:
            "https://www.burbankca.gov/web/community-development/plan-check-review",
        },
        confidence: "user_provided",
        blocking: false,
      })
    );
  }

  if (constraints.heritageTreesInWorkArea || constraints.newDrivewayOrCurbCut) {
    findings.push(
      finding({
        id: "site.trees_flagged",
        category: "Site",
        status: "needs_verification",
        summary:
          "Heritage trees or new driveway/curb cut flagged — tree protection review required",
        citation: {
          citation: "BMC § 10-1-620.3(C)(5); Title 7 Ch. 4",
          sourceUrl: ADU_HANDOUT,
        },
        confidence: "user_provided",
        blocking: false,
      })
    );
  }

  if (constraints.hillsideSlopeConcern || property.overlays.steepSlopeDetected) {
    findings.push(
      finding({
        id: "site.slope",
        category: "Site",
        status: "needs_verification",
        summary: property.overlays.steepSlopeDetected
          ? property.overlays.estimatedMaxSlopePct !== undefined
            ? `Estimated lot slope ~${property.overlays.estimatedMaxSlopePct}% (GIS) — geotechnical review may be required`
            : "Steep slope detected on parcel (GIS) — geotechnical review may be required"
          : "Steep slope / fill flagged — geotechnical review may be required",
        citation: {
          citation: "LA County LARIAC contours; site-specific determination",
          sourceUrl: ADU_HANDOUT,
        },
        confidence: property.overlays.steepSlopeDetected ? "inferred" : "user_provided",
        blocking: false,
      })
    );
  }

  return findings;
}

function evaluateUtilities(project: FeasibilityProject): RuleFinding[] {
  const { utilities } = project;
  const findings: RuleFinding[] = [];

  findings.push(
    finding({
      id: "utilities.bwp_electric",
      category: "Utilities",
      status: "needs_verification",
      summary: "BWP Electric ADU plan check requirements — submit load calc and panel info",
      citation: {
        citation: "BWP Electric ADU Requirements",
        sourceUrl:
          "https://www.burbankca.gov/web/community-development/building-permits",
      },
      blocking: false,
    })
  );

  findings.push(
    finding({
      id: "utilities.bwp_water",
      category: "Utilities",
      status: "needs_verification",
      summary: "BWP Water fixture count form required for ADU permits",
      citation: {
        citation: "BWP Water ADU Requirements",
        sourceUrl:
          "https://www.burbankca.gov/web/community-development/building-permits",
      },
      blocking: false,
    })
  );

  if (utilities.panelUpgradeLikely) {
    findings.push(
      finding({
        id: "utilities.panel",
        category: "Utilities",
        status: "warning",
        summary: "Panel upgrade likely — budget for service upgrade and BWP review timeline",
        confidence: "user_provided",
        citation: {
          citation: "BWP Electric ADU Requirements",
        },
        blocking: false,
      })
    );
  }

  if (utilities.sewerLateralUnknown) {
    findings.push(
      finding({
        id: "utilities.sewer",
        category: "Utilities",
        status: "needs_verification",
        summary: "Sewer lateral capacity/condition — Public Works review required",
        citation: {
          citation: "Public Works Department",
          sourceUrl:
            "https://www.burbankca.gov/web/community-development/plan-check-review",
        },
        blocking: false,
      })
    );
  }

  if (utilities.schoolFeesApplicable) {
    findings.push(
      finding({
        id: "utilities.school_fees",
        category: "Utilities",
        status: "info",
        summary: "Contact Burbank Unified School District Facilities for school impact fees",
        citation: {
          citation: "BUSD Facilities",
        },
        blocking: false,
      })
    );
  }

  return findings;
}

export function evaluateProject(project: FeasibilityProject): RuleFinding[] {
  return [
    ...evaluateEligibility(project),
    ...evaluateSize(project),
    ...evaluateSetbacks(project),
    ...evaluateMapEnvelope(project),
    ...evaluateFloorArea(project),
    ...evaluateHeight(project),
    ...evaluateParking(project),
    ...evaluateConstraints(project),
    ...evaluateUtilities(project),
  ];
}

export function computeVerdict(
  findings: RuleFinding[]
): FeasibilityProject["verdict"] {
  if (findings.some((f) => f.blocking && f.status === "fail")) {
    return "not_feasible";
  }
  if (
    findings.some(
      (f) =>
        f.status === "warning" ||
        f.status === "needs_verification" ||
        (f.blocking && f.status !== "pass")
    )
  ) {
    return "feasible_with_conditions";
  }
  return "feasible";
}

export function getBurbankPermitPathway(
  useBpap: boolean
): PermitStep[] {
  const base: PermitStep[] = [
    {
      order: 1,
      department: "Planning",
      title: "Pre-application / zoning preclearance",
      description:
        "Confirm site address, ADU size, zone, and overlays. Planning screens plans within 48–72 hours for zoning pre-clearance.",
      timeline: "48–72 hours (screening)",
      contact: "planning@burbankca.gov",
    },
    {
      order: 2,
      department: "Building & Safety",
      title: "ProjectDox submission",
      description:
        "Email eplancheck@burbankca.gov for portal access. Submit building permit application, plans, and ADU-specific forms.",
      timeline: "3–7 days for portal access",
      forms: [
        "Building Permit Application",
        "BWP Electric ADU Requirements",
        "BWP Water Fixture Count Form",
      ],
      contact: "eplancheck@burbankca.gov",
    },
    {
      order: 3,
      department: "Planning",
      title: "Zoning pre-clearance (plan check)",
      description:
        "Planning verifies compliance with BMC ADU standards during first plan check cycle.",
      timeline: "Part of first review",
      contact: "planning@burbankca.gov",
    },
    {
      order: 4,
      department: "Building & Safety",
      title: "Building plan check",
      description:
        "Life safety, structural, and Title 24 energy compliance review.",
      timeline: "Up to ~8 weeks first review; 2–4 weeks recheck",
      contact: "building@burbankca.gov",
    },
    {
      order: 5,
      department: "Public Works",
      title: "Public Works review",
      description: "Sewer, drainage, right-of-way, and site development.",
      contact: "Public Works (assigned in ProjectDox)",
    },
    {
      order: 6,
      department: "BWP Electric",
      title: "Electric utility review",
      description: "Load calculations, panel/meter requirements for ADU.",
      forms: ["BWP Electric ADU Plan Check Requirements"],
    },
    {
      order: 7,
      department: "BWP Water",
      title: "Water utility review",
      description: "Fixture count and water service for ADU.",
      forms: ["BWP Water Fixture Count Form"],
    },
    {
      order: 8,
      department: "Fire",
      title: "Fire Department review",
      description: "Fire access, WUI standards if applicable, egress.",
      contact: "Fire (assigned in ProjectDox)",
    },
    {
      order: 9,
      department: "BUSD",
      title: "School impact fees",
      description:
        "Contact Burbank Unified School District Facilities for applicable fees.",
    },
    {
      order: 10,
      department: "Building & Safety",
      title: "Permit issuance & inspections",
      description:
        "Stamped plans issued after all departments approve. Schedule construction inspections through final.",
    },
  ];

  if (useBpap) {
    return [
      {
        order: 0,
        department: "Planning + BPAP",
        title: "Burbank Pre-Approved ADU Program (BPAP)",
        description:
          "Use pre-approved plan set. Connect with Planning for site-specific zoning preclearance before BPAP submittal.",
        timeline: "Faster plan check for standard designs",
        sourceUrl:
          "https://www.burbankca.gov/web/community-development/pre-approved-adu",
        forms: [
          "BPAP Permit Requirements",
          "BPAP Permit Submittal Checklist",
          "BPAP G001 Sheet",
        ],
        contact: "planning@burbankca.gov",
      },
      ...base,
    ];
  }

  return base;
}

export function recommendAduTypes(project: FeasibilityProject): AduType[] {
  const recs: AduType[] = [];
  const { property, intent } = project;

  if (property.hasGarage) {
    recs.push("garage_conversion");
  }
  if (ADU_ZONES.includes(property.zone)) {
    recs.push("detached");
  }
  if (JADU_ZONES.includes(property.zone) && property.hasPrimaryDwelling) {
    recs.push("jadu");
  }
  if (property.hasGarage) {
    recs.push("adu_on_garage");
  }
  if (intent.bedrooms >= 2) {
    recs.push("attached");
  }

  return [...new Set(recs)];
}
