import type { FeasibilityProject, FindingStatus } from "../types";
import { inferLikelyNewDriveway, treeProtectionScreeningSummary } from "@/lib/gis/curb-cut-inference";

const ADU_HANDOUT =
  "https://www.burbankca.gov/documents/d/community-development/adu-handout-updated-7-11-2024";

export interface SiteRequirement {
  id: string;
  label: string;
  value: string;
  status: FindingStatus;
  citation: string;
  sourceUrl?: string;
}

function parkingExemptSummary(project: FeasibilityProject): {
  value: string;
  status: FindingStatus;
} {
  const { property, intent } = project;
  const reasons: string[] = [];

  if (property.overlays.nearPublicTransitHalfMile) {
    reasons.push("within ½ mile of public transit (GIS)");
  }
  if (property.overlays.permitParkingDistrict) {
    reasons.push("permit parking district");
  }
  if (property.overlays.historicDistrict) {
    reasons.push("historic district");
  }
  if (intent.isConversion || intent.aduTypes.includes("garage_conversion")) {
    reasons.push("garage conversion");
  }
  if (intent.aduTypes.includes("jadu") && intent.aduTypes.length === 1) {
    reasons.push("JADU only");
  }

  if (reasons.length > 0) {
    return {
      value: `Exempt — ${reasons.join("; ")}`,
      status: "pass",
    };
  }

  if (project.property.gisVerified) {
    return {
      value: "1 space required per ADU (or per bedroom, whichever is less)",
      status: "warning",
    };
  }

  return {
    value: "1 space required — confirm exemptions after parcel lookup",
    status: "needs_verification",
  };
}

export function getSiteRequirements(
  project: FeasibilityProject
): SiteRequirement[] {
  const { property, constraints, sitePlan } = project;
  const hasParcel = property.gisVerified || !!sitePlan.parcelGeoJson;
  const parking = parkingExemptSummary(project);
  const treeScreening = treeProtectionScreeningSummary(project);
  const curbCutHint = inferLikelyNewDriveway(project);
  const treeScreen = treeProtectionScreeningSummary(project);
  const curbCut = inferLikelyNewDriveway(project);

  const requirements: SiteRequirement[] = [
    {
      id: "site.primary_dwelling",
      label: "Primary dwelling required before ADU",
      value: property.hasPrimaryDwelling
        ? property.primarySqFt
          ? `Existing primary ~${property.primarySqFt.toLocaleString()} sf (Assessor/GIS)`
          : "Primary structure on lot (GIS)"
        : "No primary detected — must be approved first",
      status: property.hasPrimaryDwelling ? "pass" : "warning",
      citation: "BMC § 10-1-620.3(B)(2)",
      sourceUrl: ADU_HANDOUT,
    },
    {
      id: "site.garage",
      label: "Garage / accessory structure",
      value: property.hasGarage
        ? property.garageInFrontYard
          ? "Garage present — street-facing / front yard (GIS site plan)"
          : "Garage or accessory structure on lot (GIS)"
        : "No garage footprint detected — detached or attached new build likely",
      status: property.hasGarage ? "info" : "info",
      citation: "Site plan / LARIAC footprints",
      sourceUrl: ADU_HANDOUT,
    },
    {
      id: "site.adu_count",
      label: "ADU / JADU count limit",
      value:
        property.overlays.mountainFireZone || property.zone === "R-1-H"
          ? "One ADU or one JADU only (not both) — Mountain Fire / R-1-H"
          : "Standard: 1 ADU + 1 JADU allowed on eligible lots",
      status:
        property.overlays.mountainFireZone || property.zone === "R-1-H"
          ? "warning"
          : "pass",
      citation: "ADU Handout — Mountain Fire Zone / R-1-H",
      sourceUrl: ADU_HANDOUT,
    },
    {
      id: "site.fire_hillside",
      label: "Fire & hillside standards",
      value:
        property.overlays.mountainFireZone || property.overlays.r1hHillside
          ? "WUI / hillside construction and brush clearance standards apply"
          : hasParcel
            ? "No Mountain Fire or R-1-H overlay detected at parcel"
            : "Run parcel lookup to screen fire/hillside overlays",
      status:
        property.overlays.mountainFireZone || property.overlays.r1hHillside
          ? "warning"
          : hasParcel
            ? "pass"
            : "needs_verification",
      citation: "BMC Fire Code; ADU Handout",
      sourceUrl: ADU_HANDOUT,
    },
    {
      id: "site.parking",
      label: "ADU parking",
      value: parking.value,
      status: parking.status,
      citation: "BMC § 10-1-620.3(C–E); Gov. Code § 65852.2",
      sourceUrl: ADU_HANDOUT,
    },
    {
      id: "site.transit_height",
      label: "Detached height (transit corridor)",
      value: property.overlays.nearHighQualityTransit
        ? "Up to 18' plate/roof — within ½ mile of high-quality transit (GIS)"
        : hasParcel
          ? "Standard detached: 12' plate / 17' roof — no HQ transit detected"
          : "Confirm after parcel lookup",
      status: property.overlays.nearHighQualityTransit
        ? "pass"
        : hasParcel
          ? "info"
          : "needs_verification",
      citation: "BMC § 10-1-620.3(G); ADU Handout",
      sourceUrl: ADU_HANDOUT,
    },
    {
      id: "site.permit_parking_district",
      label: "Residential permit parking district",
      value: property.overlays.permitParkingDistrict
        ? property.overlays.permitParkingZone
          ? `Zone ${property.overlays.permitParkingZone} — permit parking street match (GIS)`
          : "In permit parking district — ADU parking exempt"
        : hasParcel
          ? "No permit parking street match — verify City zone map if street has time limits"
          : "Not auto-detected — verify on City permit zone map if street has time limits",
      status: property.overlays.permitParkingDistrict
        ? "pass"
        : hasParcel
          ? "pass"
          : "needs_verification",
      citation: "BMC § 10-1-620.3(C); City permit zone map",
      sourceUrl:
        "https://www.burbankca.gov/web/community-development/residential-parking-permit",
    },
    {
      id: "site.historic",
      label: "Architecturally significant historic district",
      value: property.overlays.historicDistrict
        ? property.overlays.historicResourceName
          ? `Historic resource: ${property.overlays.historicResourceName} (GIS / LA County inventory)`
          : "Historic resource on or near parcel — design review and parking exemption may apply"
        : hasParcel
          ? "No historic resource detected on parcel — confirm with Planning for design review triggers"
          : "Not auto-detected — confirm with Planning for design review triggers",
      status: property.overlays.historicDistrict
        ? "warning"
        : hasParcel
          ? "pass"
          : "needs_verification",
      citation: "BMC § 10-1-620.3; Historic Preservation; LA County GISNET",
      sourceUrl: ADU_HANDOUT,
    },
    {
      id: "site.front_yard_adu",
      label: "Front-yard ADU placement",
      value:
        property.garageInFrontYard && property.hasGarage
          ? "Front-yard garage/conversion — City plan review required; not auto-approved"
          : "Rear/side placement default — front-yard ADU requires Planning determination",
      status:
        property.garageInFrontYard && property.hasGarage ? "warning" : "info",
      citation: "ADU Handout — front yard / physical infeasibility",
      sourceUrl: ADU_HANDOUT,
    },
    {
      id: "site.tree_protection",
      label: "Heritage / protected trees",
      value: treeScreening.value,
      status:
        treeScreening.flagged ||
        constraints.heritageTreesInWorkArea ||
        constraints.newDrivewayOrCurbCut
          ? "needs_verification"
          : hasParcel
            ? "pass"
            : "info",
      citation: "BMC Title 7 Ch. 4; § 10-1-620.3(C)(5); LA County street trees / LARIAC canopy",
      sourceUrl: ADU_HANDOUT,
    },
    {
      id: "site.curb_cut",
      label: "Driveway / curb cut",
      value: constraints.newDrivewayOrCurbCut
        ? "New driveway or curb cut proposed — tree protection and Public Works review may apply"
        : curbCutHint.likely
          ? `${curbCutHint.reason} (screening — confirm below if applicable)`
          : property.hasGarage
            ? "Existing garage/driveway footprint on lot — new curb cut unlikely"
            : "Confirm only if project proposes new street access",
      status:
        constraints.newDrivewayOrCurbCut || curbCutHint.likely
          ? "needs_verification"
          : "info",
      citation: "BMC Title 7 Ch. 4; site plan / ADU type",
      sourceUrl: ADU_HANDOUT,
    },
    {
      id: "site.unpermitted",
      label: "Unpermitted existing structures",
      value: property.overlays.unpermittedStructureRisk
        ? property.overlays.unpermittedStructureNote ??
          "LARIAC vs Assessor discrepancy — verify all structures are permitted"
        : constraints.unpermittedStructures
          ? "Unpermitted work on lot — resolve before or during permit"
          : hasParcel
            ? "No footprint discrepancy detected — confirm no unpermitted structures in ADU work area"
            : "Confirm no unpermitted structures in ADU work area",
      status:
        property.overlays.unpermittedStructureRisk || constraints.unpermittedStructures
          ? "warning"
          : hasParcel
            ? "pass"
            : "info",
      citation: "Planning pre-clearance review; LARIAC vs Assessor screening",
      sourceUrl:
        "https://www.burbankca.gov/web/community-development/plan-check-review",
    },
    {
      id: "site.geotechnical",
      label: "Hillside / geotechnical",
      value:
        property.overlays.steepSlopeDetected
          ? property.overlays.estimatedMaxSlopePct !== undefined
            ? `Estimated lot slope ~${property.overlays.estimatedMaxSlopePct}% (LARIAC contours) — geotechnical review may be required`
            : "Steep slope detected on parcel (GIS) — geotechnical review may be required"
          : constraints.hillsideSlopeConcern
            ? "Geotechnical or grading review may be required (user flagged fill/retaining walls)"
            : property.zone === "R-1-H"
              ? "R-1-H hillside zone — geotechnical or grading review may be required"
              : hasParcel
                ? "No steep slope detected on parcel — confirm fill or retaining walls if present"
                : "Standard sites — geotech if slope or fill concerns exist",
      status:
        property.overlays.steepSlopeDetected ||
        constraints.hillsideSlopeConcern ||
        property.zone === "R-1-H"
          ? "needs_verification"
          : hasParcel
            ? "pass"
            : "info",
      citation: "LA County LARIAC contours; site-specific determination; R-1-H overlay",
      sourceUrl: ADU_HANDOUT,
    },
  ];

  return requirements;
}
