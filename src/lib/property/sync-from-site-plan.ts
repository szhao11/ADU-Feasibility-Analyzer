import type { PropertyData, SitePlanData } from "../types";

/** Front third of lot depth — garage in this band is street-facing per local site plan frame. */
const FRONT_YARD_DEPTH_RATIO = 0.33;

export function syncPropertyFromSitePlan(
  property: PropertyData,
  sitePlan: SitePlanData
): PropertyData {
  const structures = sitePlan.structures.filter((s) => s.kind !== "adu");
  const hasGarage = structures.some((s) => s.kind === "garage");
  const garage = structures.find((s) => s.kind === "garage");
  const lotDepthFt = property.lotDepthFt;

  let garageInFrontYard = property.garageInFrontYard ?? false;
  if (garage && lotDepthFt && lotDepthFt > 0) {
    const garageFrontEdge =
      garage.centerYFt - garage.depthFt / 2;
    garageInFrontYard = garageFrontEdge <= lotDepthFt * FRONT_YARD_DEPTH_RATIO;
  } else if (!hasGarage) {
    garageInFrontYard = false;
  }

  const hasPrimaryDwelling =
    property.primarySqFt !== undefined && property.primarySqFt > 0
      ? property.primarySqFt > 0
      : structures.some((s) => s.kind === "primary") || property.hasPrimaryDwelling;

  return {
    ...property,
    hasGarage,
    garageInFrontYard,
    hasPrimaryDwelling,
    overlays: {
      ...property.overlays,
      r1hHillside: property.zone === "R-1-H" || property.overlays.r1hHillside,
    },
  };
}
