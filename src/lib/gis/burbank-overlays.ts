import * as turf from "@turf/turf";
import type { LatLng, ParcelPolygon, PropertyData } from "../types";
import {
  assessUnpermittedStructureRisk,
  lookupHistoricResources,
  lookupPermitParkingDistrict,
  lookupTreeScreening,
  type BuildingScreeningInput,
} from "./site-screening";

const LA_COUNTY_FIRE_HAZARD_LAYER =
  "https://public.gis.lacounty.gov/public/rest/services/LACounty_Dynamic/Hazards/MapServer/2";

const LA_COUNTY_CONTOURS_10FT =
  "https://arcgis.gis.lacounty.gov/arcgis/rest/services/LACounty_Dynamic/Elevation/MapServer/14";

const LA_COUNTY_HMA_LAYER =
  "https://arcgis.gis.lacounty.gov/arcgis/rest/services/DRP/GISNET_Public/MapServer/414";

/** Half-mile radius for ADU parking exemption (Gov. Code § 65852.2). */
const TRANSIT_HALF_MILE_FT = 2640;

/** County hillside screening threshold (percent rise) — matches LA County HMA. */
const STEEP_SLOPE_THRESHOLD_PCT = 25;

/** High-quality transit corridor — Metro B Line + Metrolink anchors in/near Burbank. */
const HIGH_QUALITY_TRANSIT: { name: string; lng: number; lat: number }[] = [
  { name: "Metro B Line — Downtown Burbank", lng: -118.3103, lat: 34.1686 },
  { name: "Metrolink — Burbank-Downtown", lng: -118.3113, lat: 34.1797 },
  { name: "Metrolink — Burbank Airport North", lng: -118.349, lat: 34.1948 },
  { name: "Hollywood Burbank Airport station", lng: -118.3574, lat: 34.1974 },
];

/** Public transit stops for half-mile parking exemption screening. */
const PUBLIC_TRANSIT: { name: string; lng: number; lat: number }[] = [
  ...HIGH_QUALITY_TRANSIT,
  { name: "Olive & Verdugo (Burbank Bus)", lng: -118.3089, lat: 34.1804 },
  { name: "Olive & Magnolia (Burbank Bus)", lng: -118.3051, lat: 34.1748 },
  { name: "Hollywood Way & Verdugo", lng: -118.3452, lat: 34.1821 },
  { name: "Buena Vista & Verdugo", lng: -118.3289, lat: 34.1689 },
];

export interface OverlayLookupOptions {
  parcel?: ParcelPolygon;
  lotWidthFt?: number;
  lotDepthFt?: number;
  address?: string;
  apn?: string;
  buildings?: BuildingScreeningInput;
}

export interface OverlayLookupResult {
  overlays: PropertyData["overlays"];
  messages: string[];
}

function distanceFeet(a: LatLng, b: { lng: number; lat: number }): number {
  return (
    turf.distance(turf.point([a.lng, a.lat]), turf.point([b.lng, b.lat]), {
      units: "feet",
    }) ?? Infinity
  );
}

function nearestTransit(
  point: LatLng,
  stops: { name: string; lng: number; lat: number }[]
): { name: string; distanceFt: number } | null {
  let best: { name: string; distanceFt: number } | null = null;
  for (const stop of stops) {
    const d = distanceFeet(point, stop);
    if (!best || d < best.distanceFt) {
      best = { name: stop.name, distanceFt: d };
    }
  }
  return best;
}

function minLotDimensionFt(
  parcel: ParcelPolygon | undefined,
  lotWidthFt?: number,
  lotDepthFt?: number
): number | null {
  if (lotWidthFt && lotDepthFt) {
    return Math.min(lotWidthFt, lotDepthFt);
  }
  if (!parcel) return null;

  const bbox = turf.bbox(turf.polygon(parcel.coordinates));
  const widthFt =
    turf.distance([bbox[0], bbox[1]], [bbox[2], bbox[1]], { units: "feet" }) ??
    0;
  const depthFt =
    turf.distance([bbox[0], bbox[1]], [bbox[0], bbox[3]], { units: "feet" }) ??
    0;
  const minDim = Math.min(widthFt, depthFt);
  return minDim > 0 ? minDim : null;
}

function estimateMaxSlopePct(
  elevations: number[],
  minLotDimensionFt: number
): number | null {
  if (elevations.length === 0 || minLotDimensionFt <= 0) return null;
  const minElev = Math.min(...elevations);
  const maxElev = Math.max(...elevations);
  const range = maxElev - minElev;
  if (range <= 0) return 0;
  return (range / minLotDimensionFt) * 100;
}

async function lookupFireHazard(point: LatLng): Promise<{
  inVeryHigh: boolean;
  inHigh: boolean;
  hazardClass?: string;
}> {
  const params = new URLSearchParams({
    geometry: `${point.lng},${point.lat}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "HAZ_CLASS,VH_REC,SRA",
    returnGeometry: "false",
    f: "json",
  });

  try {
    const res = await fetch(`${LA_COUNTY_FIRE_HAZARD_LAYER}/query?${params}`);
    if (!res.ok) return { inVeryHigh: false, inHigh: false };

    const data = (await res.json()) as {
      features?: Array<{ attributes: { HAZ_CLASS?: string; VH_REC?: string } }>;
    };

    const attrs = data.features?.[0]?.attributes;
    const hazardClass = attrs?.HAZ_CLASS?.toUpperCase() ?? "";
    return {
      inVeryHigh: hazardClass.includes("VERY HIGH"),
      inHigh: hazardClass.includes("HIGH") && !hazardClass.includes("VERY"),
      hazardClass: attrs?.HAZ_CLASS,
    };
  } catch {
    return { inVeryHigh: false, inHigh: false };
  }
}

async function queryContourElevations(
  point: LatLng,
  parcel?: ParcelPolygon
): Promise<number[]> {
  const params = new URLSearchParams({
    spatialRel: "esriSpatialRelIntersects",
    outFields: "ELEVATION",
    returnGeometry: "false",
    f: "json",
    resultRecordCount: "100",
  });

  if (parcel) {
    params.set(
      "geometry",
      JSON.stringify({
        rings: parcel.coordinates,
        spatialReference: { wkid: 4326 },
      })
    );
    params.set("geometryType", "esriGeometryPolygon");
    params.set("inSR", "4326");
  } else {
    params.set("geometry", `${point.lng},${point.lat}`);
    params.set("geometryType", "esriGeometryPoint");
    params.set("inSR", "4326");
    params.set("distance", "250");
    params.set("units", "esriSRUnit_Foot");
  }

  try {
    const res = await fetch(`${LA_COUNTY_CONTOURS_10FT}/query?${params}`);
    if (!res.ok) return [];

    const data = (await res.json()) as {
      features?: Array<{ attributes: { ELEVATION?: number } }>;
    };

    return (data.features ?? [])
      .map((f) => f.attributes.ELEVATION)
      .filter((e): e is number => typeof e === "number" && Number.isFinite(e));
  } catch {
    return [];
  }
}

async function lookupHillsideManagementArea(point: LatLng): Promise<string | null> {
  const params = new URLSearchParams({
    geometry: `${point.lng},${point.lat}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "STATUS",
    returnGeometry: "false",
    f: "json",
  });

  try {
    const res = await fetch(`${LA_COUNTY_HMA_LAYER}/query?${params}`);
    if (!res.ok) return null;

    const data = (await res.json()) as {
      features?: Array<{ attributes: { STATUS?: string } }>;
    };
    return data.features?.[0]?.attributes.STATUS ?? null;
  } catch {
    return null;
  }
}

async function lookupSteepSlope(
  point: LatLng,
  options?: OverlayLookupOptions
): Promise<{ detected: boolean; estimatedMaxSlopePct?: number; message?: string }> {
  const minDim = minLotDimensionFt(
    options?.parcel,
    options?.lotWidthFt,
    options?.lotDepthFt
  );

  const hmaStatus = await lookupHillsideManagementArea(point);
  if (hmaStatus) {
    return {
      detected: true,
      message: `LA County Hillside Management Area (${hmaStatus}) — geotechnical review may be required.`,
    };
  }

  const elevations = await queryContourElevations(point, options?.parcel);
  if (elevations.length === 0 || minDim === null) {
    return { detected: false };
  }

  const estimatedMaxSlopePct = estimateMaxSlopePct(elevations, minDim);
  if (estimatedMaxSlopePct === null) {
    return { detected: false };
  }

  const rounded = Math.round(estimatedMaxSlopePct);
  if (estimatedMaxSlopePct >= STEEP_SLOPE_THRESHOLD_PCT) {
    const elevRange =
      Math.max(...elevations) - Math.min(...elevations);
    return {
      detected: true,
      estimatedMaxSlopePct: rounded,
      message: `Estimated lot slope ~${rounded}% (${elevRange} ft elevation change across parcel; LARIAC 10' contours) — geotechnical review may be required.`,
    };
  }

  return { detected: false, estimatedMaxSlopePct: rounded };
}

export async function lookupBurbankOverlays(
  point: LatLng,
  zone: PropertyData["zone"],
  options?: OverlayLookupOptions
): Promise<OverlayLookupResult> {
  const messages: string[] = [];
  const overlays: PropertyData["overlays"] = {
    mountainFireZone: false,
    r1hHillside: zone === "R-1-H",
    nearPublicTransitHalfMile: false,
    permitParkingDistrict: false,
    nearHighQualityTransit: false,
    historicDistrict: false,
    steepSlopeDetected: false,
    streetTreesNearby: false,
    treeCanopyOnParcel: false,
    unpermittedStructureRisk: false,
  };

  const [fire, slope, historic, trees] = await Promise.all([
    lookupFireHazard(point),
    lookupSteepSlope(point, options),
    lookupHistoricResources(point, options?.parcel, options?.apn),
    lookupTreeScreening(options?.parcel),
  ]);

  const parking = options?.address
    ? lookupPermitParkingDistrict(options.address)
    : { detected: false as const };

  const unpermitted = options?.buildings
    ? assessUnpermittedStructureRisk(options.buildings)
    : { risk: false as const };

  if (fire.inVeryHigh || fire.inHigh) {
    overlays.mountainFireZone = true;
    messages.push(
      fire.hazardClass
        ? `LA County fire hazard: ${fire.hazardClass} — Mountain Fire Zone standards may apply.`
        : "LA County fire hazard zone detected — Mountain Fire Zone standards may apply."
    );
  }

  if (slope.detected) {
    overlays.steepSlopeDetected = true;
    if (slope.estimatedMaxSlopePct !== undefined) {
      overlays.estimatedMaxSlopePct = slope.estimatedMaxSlopePct;
    }
    if (slope.message) {
      messages.push(slope.message);
    }
  }

  if (parking.detected) {
    overlays.permitParkingDistrict = true;
    overlays.permitParkingZone = parking.zone;
    messages.push(
      `Residential permit parking Zone ${parking.zone} likely (${parking.street ?? "street match"}) — ADU parking exemption may apply; confirm block signage.`
    );
  }

  if (historic.detected) {
    overlays.historicDistrict = true;
    overlays.historicResourceName = historic.resourceName;
    messages.push(
      historic.resourceName
        ? `Historic resource nearby or on parcel: ${historic.resourceName} — design review and parking exemption may apply.`
        : "Historic resource detected on or near parcel — confirm design review triggers with Planning."
    );
  }

  if (trees.streetTreesNearby || trees.canopyOnParcel) {
    overlays.streetTreesNearby = trees.streetTreesNearby;
    overlays.streetTreeCount = trees.streetTreeCount;
    overlays.largeStreetTreesNearby = trees.largeStreetTrees;
    overlays.treeCanopyOnParcel = trees.canopyOnParcel;

    const treeParts: string[] = [];
    if (trees.largeStreetTrees > 0) {
      treeParts.push(`${trees.largeStreetTrees} large street tree(s) within 75'`);
    } else if (trees.streetTreeCount > 0) {
      treeParts.push(`${trees.streetTreeCount} street tree(s) near parcel`);
    }
    if (trees.canopyOnParcel) {
      treeParts.push("tree canopy on lot");
    }
    if (treeParts.length > 0) {
      messages.push(
        `${treeParts.join("; ")} — tree protection (BMC Title 7 Ch. 4) may apply if work affects trees or parkway.`
      );
    }
  }

  if (unpermitted.risk) {
    overlays.unpermittedStructureRisk = true;
    overlays.unpermittedStructureNote = unpermitted.note;
    if (unpermitted.note) {
      messages.push(`${unpermitted.note}.`);
    }
  }

  if (zone === "R-1-H") {
    messages.push("R-1-H hillside zone — one ADU or JADU only; hillside standards apply.");
  }

  const nearestPublic = nearestTransit(point, PUBLIC_TRANSIT);
  if (nearestPublic && nearestPublic.distanceFt <= TRANSIT_HALF_MILE_FT) {
    overlays.nearPublicTransitHalfMile = true;
    messages.push(
      `Within ½ mile of ${nearestPublic.name} (${Math.round(nearestPublic.distanceFt)} ft) — ADU parking exemption likely.`
    );
  }

  const nearestHq = nearestTransit(point, HIGH_QUALITY_TRANSIT);
  if (nearestHq && nearestHq.distanceFt <= TRANSIT_HALF_MILE_FT) {
    overlays.nearHighQualityTransit = true;
    if (!overlays.nearPublicTransitHalfMile) {
      messages.push(
        `Near high-quality transit (${nearestHq.name}) — detached height up to 18' may apply.`
      );
    }
  }

  return { overlays, messages };
}

export function describeTransitProximity(point: LatLng): {
  nearestPublic: { name: string; distanceFt: number } | null;
  nearestHq: { name: string; distanceFt: number } | null;
} {
  return {
    nearestPublic: nearestTransit(point, PUBLIC_TRANSIT),
    nearestHq: nearestTransit(point, HIGH_QUALITY_TRANSIT),
  };
}
