import type { FeasibilityProject } from "../types";

/**
 * Infer whether a new driveway or curb cut is likely based on ADU type and site plan.
 * Always requires user confirmation — this only drives hints and findings.
 */
export function inferLikelyNewDriveway(project: FeasibilityProject): {
  likely: boolean;
  reason?: string;
} {
  const { intent, property } = project;
  if (intent.aduTypes.length === 0) {
    return { likely: false };
  }

  if (intent.aduTypes.includes("garage_conversion") || intent.aduTypes.includes("jadu")) {
    return { likely: false };
  }

  const needsNewStructure =
    intent.aduTypes.includes("detached") ||
    intent.aduTypes.includes("attached") ||
    intent.aduTypes.includes("adu_on_garage");

  if (!needsNewStructure) {
    return { likely: false };
  }

  if (!property.hasGarage && intent.aduTypes.includes("detached")) {
    return {
      likely: true,
      reason:
        "Detached ADU selected and no garage/driveway footprint detected — confirm curb cut and driveway approach with Planning",
    };
  }

  if (intent.aduTypes.includes("attached") && !property.hasGarage) {
    return {
      likely: true,
      reason:
        "Attached ADU without existing garage access — confirm whether new driveway or curb cut is proposed",
    };
  }

  return { likely: false };
}

export function treeProtectionScreeningSummary(project: FeasibilityProject): {
  flagged: boolean;
  value: string;
} {
  const { property, constraints } = project;
  const parts: string[] = [];

  if (property.overlays.largeStreetTreesNearby && property.overlays.largeStreetTreesNearby > 0) {
    parts.push(
      `${property.overlays.largeStreetTreesNearby} large street tree(s) within 75' (≥24" diameter, GIS)`
    );
  } else if (property.overlays.streetTreesNearby) {
    parts.push(
      `${property.overlays.streetTreeCount ?? "Multiple"} street tree(s) near parcel (GIS)`
    );
  }

  if (property.overlays.treeCanopyOnParcel) {
    parts.push("Tree canopy detected on lot (LARIAC 2023)");
  }

  if (constraints.heritageTreesInWorkArea) {
    parts.push("User flagged heritage/protected trees in work area");
  }

  if (constraints.newDrivewayOrCurbCut) {
    parts.push("New driveway or curb cut proposed");
  }

  if (parts.length === 0) {
    return {
      flagged: false,
      value: "No street trees or canopy flagged — confirm protected trees if work affects parkway",
    };
  }

  return {
    flagged: true,
    value: `${parts.join("; ")} — BMC Title 7 Ch. 4 review may apply`,
  };
}
