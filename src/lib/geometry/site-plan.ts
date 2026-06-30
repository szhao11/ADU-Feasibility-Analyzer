import * as turf from "@turf/turf";
import { v4 as uuidv4 } from "uuid";
import {
  MIN_SEPARATION_FACE_FT,
  MIN_SIDE_SETBACK_FT,
  MIN_REAR_SETBACK_FT,
  MIN_EGRESS_ACCESS_FT,
  BUILDABLE_CONSUMED_WARN_PCT,
} from "../rules/envelope-requirements";
import type {
  EnvelopeData,
  LatLng,
  ParcelPolygon,
  RectFootprint,
  SitePlanData,
  SitePlanSyncOptions,
  AduFloorAreaAnalysis,
} from "../types";
import {
  analyzeAduFloorArea,
} from "../rules/adu-floor-area";

const METERS_TO_FEET = 3.28084;

export interface OrientedParcel {
  origin: LatLng;
  axisBearingDeg: number;
  frontEdgeIndex: number;
}

export interface LotDimensions {
  widthFt: number;
  depthFt: number;
}

export interface EnvelopeAnalysis {
  sideSetbackFt: number;
  rearSetbackFt: number;
  separationFromPrimaryFt: number;
  separationFromGarageFt: number;
  minStructureSeparationFt: number;
  proposedSqFt: number;
  violations: string[];
  withinParcel: boolean;
  remainingBuildableSqFt: number;
  buildableConsumedPct: number;
  minAccessPassageFt: number;
  designWarnings: string[];
  floorAreaAnalysis?: AduFloorAreaAnalysis;
}

export function createDefaultSitePlan(): SitePlanData {
  return { structures: [] };
}

/** Convert lng/lat to local feet using origin and bearing. */
export function toLocalFeet(
  point: LatLng,
  origin: LatLng,
  axisBearingDeg: number
): { x: number; y: number } {
  const from = turf.point([origin.lng, origin.lat]);
  const to = turf.point([point.lng, point.lat]);
  const distM = turf.distance(from, to, { units: "meters" });
  const bearing = turf.bearing(from, to);
  const rel = ((bearing - axisBearingDeg + 360) % 360) * (Math.PI / 180);
  const distFt = distM * METERS_TO_FEET;
  return {
    x: distFt * Math.sin(rel),
    y: distFt * Math.cos(rel),
  };
}

export function fromLocalFeet(
  x: number,
  y: number,
  origin: LatLng,
  axisBearingDeg: number
): LatLng {
  const distM = Math.sqrt(x * x + y * y) / METERS_TO_FEET;
  const rel = Math.atan2(x, y) * (180 / Math.PI);
  const bearing = (axisBearingDeg + rel + 360) % 360;
  const dest = turf.destination(
    turf.point([origin.lng, origin.lat]),
    distM,
    bearing,
    { units: "meters" }
  );
  const [lng, lat] = dest.geometry.coordinates;
  return { lat, lng };
}

function edgeMidpoint(a: number[], b: number[]): LatLng {
  return { lat: (a[1] + b[1]) / 2, lng: (a[0] + b[0]) / 2 };
}

function pointToSegmentDistance(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) {
    return Math.hypot(p.x - a.x, p.y - a.y);
  }
  const t = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy))
  );
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function rectCorners(fp: RectFootprint): { x: number; y: number }[] {
  const hw = fp.widthFt / 2;
  const hd = fp.depthFt / 2;
  const rad = (fp.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const corners = [
    { x: -hw, y: -hd },
    { x: hw, y: -hd },
    { x: hw, y: hd },
    { x: -hw, y: hd },
  ];
  return corners.map((c) => ({
    x: fp.centerXFt + c.x * cos - c.y * sin,
    y: fp.centerYFt + c.x * sin + c.y * cos,
  }));
}

function rectsOverlap(
  a: Pick<RectFootprint, "centerXFt" | "centerYFt" | "widthFt" | "depthFt">,
  b: Pick<RectFootprint, "centerXFt" | "centerYFt" | "widthFt" | "depthFt">,
  gapFt = 0
): boolean {
  return (
    Math.abs(a.centerXFt - b.centerXFt) <
      a.widthFt / 2 + b.widthFt / 2 + gapFt &&
    Math.abs(a.centerYFt - b.centerYFt) <
      a.depthFt / 2 + b.depthFt / 2 + gapFt
  );
}

function structureLocalCorners(
  structure: RectFootprint,
  origin: LatLng,
  axisBearingDeg: number
): { x: number; y: number }[] {
  if (structure.footprintGeoJson) {
    const ring = structure.footprintGeoJson.coordinates[0];
    const n = ring.length - 1;
    return Array.from({ length: n }, (_, i) =>
      toLocalFeet({ lat: ring[i][1], lng: ring[i][0] }, origin, axisBearingDeg)
    );
  }
  return rectCorners(structure);
}

export function polygonToLocalRect(
  polygon: ParcelPolygon,
  origin: LatLng,
  axisBearingDeg: number
): Pick<
  RectFootprint,
  "centerXFt" | "centerYFt" | "widthFt" | "depthFt" | "rotationDeg"
> {
  const ring = polygon.coordinates[0];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const coord of ring) {
    const local = toLocalFeet(
      { lat: coord[1], lng: coord[0] },
      origin,
      axisBearingDeg
    );
    minX = Math.min(minX, local.x);
    maxX = Math.max(maxX, local.x);
    minY = Math.min(minY, local.y);
    maxY = Math.max(maxY, local.y);
  }

  return {
    centerXFt: (minX + maxX) / 2,
    centerYFt: (minY + maxY) / 2,
    widthFt: Math.max(maxX - minX, 1),
    depthFt: Math.max(maxY - minY, 1),
    rotationDeg: 0,
  };
}

export function structureToPolygon(
  structure: RectFootprint,
  origin: LatLng,
  axisBearingDeg: number
): ParcelPolygon {
  if (structure.footprintGeoJson) {
    return structure.footprintGeoJson;
  }
  return footprintToPolygon(structure, origin, axisBearingDeg);
}

export function suggestAduPlacement(
  sitePlan: SitePlanData,
  setbacks: { frontFt: number; sideFt: number; rearFt: number },
  aduSize: { widthFt: number; depthFt: number }
): { centerXFt: number; centerYFt: number } {
  const { parcelGeoJson, origin, axisBearingDeg, structures } = sitePlan;
  if (!parcelGeoJson || !origin || axisBearingDeg === undefined) {
    return { centerXFt: 20, centerYFt: 60 };
  }

  const dims = estimateLotDimensions(parcelGeoJson, origin, axisBearingDeg);
  const xMin = setbacks.sideFt + aduSize.widthFt / 2;
  const xMax = dims.widthFt - setbacks.sideFt - aduSize.widthFt / 2;
  const yMin = setbacks.frontFt + aduSize.depthFt / 2;
  const yMax = dims.depthFt - setbacks.rearFt - aduSize.depthFt / 2;

  if (xMax <= xMin || yMax <= yMin) {
    return {
      centerXFt: dims.widthFt / 2,
      centerYFt: Math.max(yMin, dims.depthFt * 0.65),
    };
  }

  const obstacles = structures
    .filter((s) => s.kind !== "adu")
    .map((s) =>
      s.footprintGeoJson
        ? polygonToLocalRect(s.footprintGeoJson, origin, axisBearingDeg)
        : s
    );

  const fits = (cx: number, cy: number) => {
    const candidate = {
      centerXFt: cx,
      centerYFt: cy,
      widthFt: aduSize.widthFt,
      depthFt: aduSize.depthFt,
    };
    if (
      cx - aduSize.widthFt / 2 < setbacks.sideFt ||
      cx + aduSize.widthFt / 2 > dims.widthFt - setbacks.sideFt ||
      cy - aduSize.depthFt / 2 < setbacks.frontFt ||
      cy + aduSize.depthFt / 2 > dims.depthFt - setbacks.rearFt
    ) {
      return false;
    }
    return !obstacles.some((obs) =>
      rectsOverlap(candidate, obs, MIN_SEPARATION_FACE_FT)
    );
  };

  const primary = structures.find((s) => s.kind === "primary");
  const primaryX = primary?.centerXFt ?? dims.widthFt / 2;
  const preferX =
    primaryX > dims.widthFt / 2
      ? xMin
      : primaryX < dims.widthFt / 2
        ? xMax
        : dims.widthFt / 2;

  const candidates: Array<{ x: number; y: number; rank: number }> = [];
  for (let y = yMax; y >= yMin; y -= 4) {
    for (let x = preferX; x <= xMax; x += 4) {
      candidates.push({
        x,
        y,
        rank: Math.abs(x - preferX) + (yMax - y) * 0.25,
      });
    }
    for (let x = preferX - 4; x >= xMin; x -= 4) {
      candidates.push({
        x,
        y,
        rank: Math.abs(x - preferX) + (yMax - y) * 0.25,
      });
    }
  }
  candidates.sort((a, b) => a.rank - b.rank);

  for (const c of candidates) {
    if (fits(c.x, c.y)) {
      return { centerXFt: c.x, centerYFt: c.y };
    }
  }

  return { centerXFt: dims.widthFt / 2, centerYFt: yMax };
}

function structureBoundsWithSeparation(
  structure: RectFootprint,
  origin: LatLng,
  axisBearingDeg: number,
  separationFt: number
): { minX: number; maxX: number; minY: number; maxY: number } {
  const corners = structureLocalCorners(structure, origin, axisBearingDeg);
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  return {
    minX: Math.min(...xs) - separationFt,
    maxX: Math.max(...xs) + separationFt,
    minY: Math.min(...ys) - separationFt,
    maxY: Math.max(...ys) + separationFt,
  };
}

function bufferStructureForSeparation(
  structPoly: ParcelPolygon,
  separationFt: number
): GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null {
  try {
    const feature = turf.polygon(structPoly.coordinates);
    const buffered = turf.buffer(feature, separationFt, { units: "feet" });
    if (!buffered?.geometry) return null;
    return buffered as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
  } catch {
    return null;
  }
}

type LocalBounds = { minX: number; maxX: number; minY: number; maxY: number };

/** Minimum clear side-yard passage width (fire access / egress heuristic). */
export function measureMinAccessPassage(
  sitePlan: SitePlanData,
  setbacks: { frontFt: number; sideFt: number; rearFt: number },
  separationFt = MIN_SEPARATION_FACE_FT,
  extraObstacles: LocalBounds[] = []
): number {
  const { parcelGeoJson, origin, axisBearingDeg, structures } = sitePlan;
  if (!parcelGeoJson || !origin || axisBearingDeg === undefined) {
    return 0;
  }

  const { widthFt, depthFt } = estimateLotDimensions(
    parcelGeoJson,
    origin,
    axisBearingDeg
  );
  const obstacles: LocalBounds[] = [
    ...structures
      .filter((s) => s.kind !== "adu")
      .map((s) =>
        structureBoundsWithSeparation(s, origin, axisBearingDeg, separationFt)
      ),
    ...extraObstacles,
  ];

  const yMin = setbacks.frontFt;
  const yMax = depthFt - setbacks.rearFt;
  let minPassage = Infinity;

  for (let y = yMin; y <= yMax; y += 2) {
    const active = obstacles.filter((obs) => y >= obs.minY && y <= obs.maxY);
    if (active.length === 0) continue;

    active.sort((a, b) => a.minX - b.minX);

    let leftEdge = setbacks.sideFt;
    for (const obs of active) {
      const gap = obs.minX - leftEdge;
      if (gap > 0) minPassage = Math.min(minPassage, gap);
      leftEdge = Math.max(leftEdge, obs.maxX);
    }
    const rightGap = widthFt - setbacks.sideFt - leftEdge;
    if (rightGap > 0) minPassage = Math.min(minPassage, rightGap);
  }

  return Number.isFinite(minPassage) ? minPassage : Infinity;
}

function buildDesignWarnings(
  buildableConsumedPct: number,
  minAccessPassageFt: number,
  maxSqFt: number,
  maxFootprintAreaSqFt: number,
  floorAreaAnalysis?: AduFloorAreaAnalysis
): string[] {
  const warnings: string[] = [];

  if (buildableConsumedPct >= BUILDABLE_CONSUMED_WARN_PCT) {
    warnings.push(
      `Max ADU footprint (${maxFootprintAreaSqFt} sf) consumes ${buildableConsumedPct.toFixed(0)}% of net buildable area — little rear open space remains (ADU exempt from open space; verify fire access).`
    );
  }

  if (
    Number.isFinite(minAccessPassageFt) &&
    minAccessPassageFt < MIN_EGRESS_ACCESS_FT
  ) {
    warnings.push(
      `Side access passage ${minAccessPassageFt.toFixed(1)}' < ${MIN_EGRESS_ACCESS_FT}' — verify fire department access and egress path to public way (CBC / plan check).`
    );
  }

  if (floorAreaAnalysis) {
    const primary = floorAreaAnalysis.byType[0];
    if (primary && primary.maxSingleStoryTotalSqFt < maxSqFt * 0.5) {
      warnings.push(
        `Site-limited single-story max ${primary.maxSingleStoryTotalSqFt} sf vs code max ${maxSqFt} sf (setbacks, 5' separation, egress).`
      );
    }
  } else if (maxFootprintAreaSqFt < maxSqFt * 0.5) {
    warnings.push(
      `Largest feasible ADU footprint (${maxFootprintAreaSqFt} sf) is well below code max (${maxSqFt} sf) due to structure separation and setbacks.`
    );
  }

  return warnings;
}

function analyzeSiteDesign(
  sitePlan: SitePlanData,
  setbacks: { frontFt: number; sideFt: number; rearFt: number },
  maxSqFt: number,
  floorAreaContext?: SitePlanSyncOptions["floorAreaContext"]
): Pick<
  EnvelopeAnalysis,
  | "remainingBuildableSqFt"
  | "buildableConsumedPct"
  | "minAccessPassageFt"
  | "designWarnings"
  | "floorAreaAnalysis"
> {
  const zone = buildNetBuildableZone(sitePlan, setbacks);
  const maxFootprint = computeMaxAduFootprint(sitePlan, setbacks, maxSqFt);
  const floorAreaAnalysis = floorAreaContext
    ? analyzeAduFloorArea(sitePlan, {
        setbacks,
        codeMaxSqFt: maxSqFt,
        aduTypes: floorAreaContext.intent.aduTypes,
        hasGarage: floorAreaContext.property.hasGarage,
        nearHighQualityTransit:
          floorAreaContext.property.overlays.nearHighQualityTransit,
      }) ?? undefined
    : undefined;
  const netAreaSqFt = zone
    ? turf.area(zone) * 10.763910416709722
    : 0;
  const maxAreaSqFt =
    floorAreaAnalysis?.byType[0]?.singleStoryFootprintSqFt ??
    maxFootprint?.areaSqFt ??
    0;
  const remainingBuildableSqFt = Math.max(0, netAreaSqFt - maxAreaSqFt);
  const buildableConsumedPct =
    netAreaSqFt > 0 ? (maxAreaSqFt / netAreaSqFt) * 100 : 0;
  const minAccessPassageFt = measureMinAccessPassage(sitePlan, setbacks);

  return {
    remainingBuildableSqFt,
    buildableConsumedPct,
    minAccessPassageFt,
    floorAreaAnalysis,
    designWarnings: buildDesignWarnings(
      buildableConsumedPct,
      minAccessPassageFt,
      maxSqFt,
      maxAreaSqFt,
      floorAreaAnalysis
    ),
  };
}

function minRectToRect(
  a: { x: number; y: number }[],
  b: { x: number; y: number }[]
): number {
  let min = Infinity;
  for (const p of a) {
    for (let i = 0; i < b.length; i++) {
      min = Math.min(
        min,
        pointToSegmentDistance(p, b[i], b[(i + 1) % b.length])
      );
    }
  }
  for (const p of b) {
    for (let i = 0; i < a.length; i++) {
      min = Math.min(
        min,
        pointToSegmentDistance(p, a[i], a[(i + 1) % a.length])
      );
    }
  }
  return min;
}

function lotBoundsInLocalFeet(
  polygon: ParcelPolygon,
  origin: LatLng,
  axisBearingDeg: number
): { minX: number; maxX: number; minY: number; maxY: number } {
  const ring = polygon.coordinates[0];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const coord of ring) {
    const local = toLocalFeet(
      { lat: coord[1], lng: coord[0] },
      origin,
      axisBearingDeg
    );
    minX = Math.min(minX, local.x);
    maxX = Math.max(maxX, local.x);
    minY = Math.min(minY, local.y);
    maxY = Math.max(maxY, local.y);
  }

  return { minX, maxX, minY, maxY };
}

export function orientParcel(
  polygon: ParcelPolygon,
  streetPoint: LatLng
): OrientedParcel {
  const ring = polygon.coordinates[0];
  let bestEdge = 0;
  let bestDist = Infinity;

  for (let i = 0; i < ring.length - 1; i++) {
    const mid = edgeMidpoint(ring[i], ring[i + 1]);
    const d =
      (mid.lat - streetPoint.lat) ** 2 + (mid.lng - streetPoint.lng) ** 2;
    if (d < bestDist) {
      bestDist = d;
      bestEdge = i;
    }
  }

  const a = ring[bestEdge];
  const b = ring[bestEdge + 1];
  const edgeBearing = turf.bearing(turf.point(a), turf.point(b));

  // Local +Y is depth into the lot; +X is frontage left-to-right.
  const perpA = (edgeBearing + 90 + 360) % 360;
  const perpB = (edgeBearing - 90 + 360) % 360;
  const testOrigin = { lat: a[1], lng: a[0] };
  const centroid = turf.centroid(turf.polygon(polygon.coordinates));
  const [cLng, cLat] = centroid.geometry.coordinates;
  const cLocalA = toLocalFeet({ lat: cLat, lng: cLng }, testOrigin, perpA);
  const cLocalB = toLocalFeet({ lat: cLat, lng: cLng }, testOrigin, perpB);
  const axisBearingDeg = cLocalA.y >= cLocalB.y ? perpA : perpB;

  // Use the front corner with smaller X as origin (front-left).
  let origin = { lat: a[1], lng: a[0] };
  const bLocal = toLocalFeet({ lat: b[1], lng: b[0] }, origin, axisBearingDeg);
  if (bLocal.x < 0) {
    origin = { lat: b[1], lng: b[0] };
  }

  const bounds = lotBoundsInLocalFeet(polygon, origin, axisBearingDeg);
  if (bounds.minX !== 0 || bounds.minY !== 0) {
    origin = fromLocalFeet(bounds.minX, bounds.minY, origin, axisBearingDeg);
  }

  return {
    origin,
    axisBearingDeg,
    frontEdgeIndex: bestEdge,
  };
}

export function estimateLotDimensions(
  polygon: ParcelPolygon,
  origin: LatLng,
  axisBearingDeg: number
): LotDimensions {
  const { minX, maxX, minY, maxY } = lotBoundsInLocalFeet(
    polygon,
    origin,
    axisBearingDeg
  );

  return {
    widthFt: Math.max(maxX - minX, 1),
    depthFt: Math.max(maxY - minY, 1),
  };
}

export function footprintToPolygon(
  fp: RectFootprint,
  origin: LatLng,
  axisBearingDeg: number
): ParcelPolygon {
  const corners = rectCorners(fp);
  const coords = corners.map((c) => {
    const ll = fromLocalFeet(c.x, c.y, origin, axisBearingDeg);
    return [ll.lng, ll.lat];
  });
  coords.push(coords[0]);
  return { type: "Polygon", coordinates: [coords] };
}

function rectLocalBounds(fp: RectFootprint): LocalBounds {
  const corners = rectCorners(fp);
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

/** Setback distances from ADU to lot lines — matches buildSetbackEnvelopePolygon / max footprint zone. */
function measureAduSetbacks(
  adu: RectFootprint,
  lot: LotDimensions
): { sideSetbackFt: number; rearSetbackFt: number; frontSetbackFt: number } {
  const { minX, maxX, minY, maxY } = rectLocalBounds(adu);
  return {
    sideSetbackFt: Math.min(minX, lot.widthFt - maxX),
    rearSetbackFt: lot.depthFt - maxY,
    frontSetbackFt: minY,
  };
}

export function analyzeSitePlan(
  sitePlan: SitePlanData,
  frontSetbackFt = 20,
  setbacks = {
    frontFt: frontSetbackFt,
    sideFt: MIN_SIDE_SETBACK_FT,
    rearFt: MIN_REAR_SETBACK_FT,
  },
  maxSqFt = 1000,
  floorAreaContext?: SitePlanSyncOptions["floorAreaContext"]
): EnvelopeAnalysis | null {
  const { parcelGeoJson, origin, axisBearingDeg, structures } = sitePlan;
  if (!parcelGeoJson || !origin || axisBearingDeg === undefined) {
    return null;
  }

  const design = analyzeSiteDesign(
    sitePlan,
    setbacks,
    maxSqFt,
    floorAreaContext
  );
  const adu = structures.find((s) => s.kind === "adu");
  if (!adu) {
    return {
      sideSetbackFt: 0,
      rearSetbackFt: 0,
      separationFromPrimaryFt: 0,
      separationFromGarageFt: 0,
      minStructureSeparationFt: 0,
      proposedSqFt: 0,
      violations: [],
      withinParcel: true,
      ...design,
    };
  }

  const lot = estimateLotDimensions(parcelGeoJson, origin, axisBearingDeg);
  const { sideSetbackFt: minSide, rearSetbackFt: minRear, frontSetbackFt: minFront } =
    measureAduSetbacks(adu, lot);

  const aduRect = rectCorners(adu);

  let separationFromPrimaryFt = Infinity;
  let separationFromGarageFt = Infinity;
  let minStructureSeparationFt = Infinity;

  for (const structure of structures) {
    if (structure.kind === "adu") continue;
    const dist = minRectToRect(
      aduRect,
      structureLocalCorners(structure, origin, axisBearingDeg)
    );
    minStructureSeparationFt = Math.min(minStructureSeparationFt, dist);
    if (structure.kind === "primary") separationFromPrimaryFt = dist;
    if (structure.kind === "garage") separationFromGarageFt = dist;
  }

  const violations: string[] = [];

  if (minSide < MIN_SIDE_SETBACK_FT) {
    violations.push(
      `Side setback ${minSide.toFixed(1)}' < ${MIN_SIDE_SETBACK_FT}' minimum`
    );
  }
  if (minRear < MIN_REAR_SETBACK_FT) {
    violations.push(
      `Rear setback ${minRear.toFixed(1)}' < ${MIN_REAR_SETBACK_FT}' minimum`
    );
  }
  if (minFront < frontSetbackFt) {
    violations.push(
      `Front setback ${minFront.toFixed(1)}' < ${frontSetbackFt}' prevailing`
    );
  }
  if (
    Number.isFinite(separationFromPrimaryFt) &&
    separationFromPrimaryFt < MIN_SEPARATION_FACE_FT
  ) {
    violations.push(
      `Primary separation ${separationFromPrimaryFt.toFixed(1)}' < ${MIN_SEPARATION_FACE_FT}' face-to-face`
    );
  }
  if (
    Number.isFinite(separationFromGarageFt) &&
    separationFromGarageFt < MIN_SEPARATION_FACE_FT
  ) {
    violations.push(
      `Garage separation ${separationFromGarageFt.toFixed(1)}' < ${MIN_SEPARATION_FACE_FT}' face-to-face`
    );
  }

  const aduPoly = footprintToPolygon(adu, origin, axisBearingDeg);
  const parcelFeature = turf.polygon(parcelGeoJson.coordinates);
  const aduFeature = turf.polygon(aduPoly.coordinates);
  const withinParcel = turf.booleanWithin(aduFeature, parcelFeature);
  if (!withinParcel) {
    violations.push("ADU footprint extends outside parcel boundary");
  }

  return {
    sideSetbackFt: minSide,
    rearSetbackFt: minRear,
    separationFromPrimaryFt: Number.isFinite(separationFromPrimaryFt)
      ? separationFromPrimaryFt
      : 0,
    separationFromGarageFt: Number.isFinite(separationFromGarageFt)
      ? separationFromGarageFt
      : 0,
    minStructureSeparationFt: Number.isFinite(minStructureSeparationFt)
      ? minStructureSeparationFt
      : 0,
    proposedSqFt: adu.widthFt * adu.depthFt,
    violations,
    withinParcel,
    ...design,
  };
}

export function syncEnvelopeFromSitePlan(
  sitePlan: SitePlanData,
  envelope: EnvelopeData,
  frontSetbackFtOrOptions?: number | SitePlanSyncOptions
): EnvelopeData {
  const options: SitePlanSyncOptions =
    typeof frontSetbackFtOrOptions === "number"
      ? { frontSetbackFt: frontSetbackFtOrOptions }
      : (frontSetbackFtOrOptions ?? {});

  const frontSetbackFt = options.frontSetbackFt ?? 20;
  const setbacks = options.setbacks ?? {
    frontFt: frontSetbackFt,
    sideFt: MIN_SIDE_SETBACK_FT,
    rearFt: MIN_REAR_SETBACK_FT,
  };
  const maxSqFt = options.maxSqFt ?? 1000;

  const analysis = analyzeSitePlan(
    sitePlan,
    frontSetbackFt,
    setbacks,
    maxSqFt,
    options.floorAreaContext
  );
  if (!analysis) return envelope;

  return {
    ...envelope,
    proposedSqFt: analysis.proposedSqFt || envelope.proposedSqFt,
    sideSetbackFt: analysis.sideSetbackFt,
    rearSetbackFt: analysis.rearSetbackFt,
    separationFromPrimaryFt: analysis.separationFromPrimaryFt,
    separationFromGarageFt: analysis.separationFromGarageFt,
    minStructureSeparationFt: analysis.minStructureSeparationFt,
    mapSideSetbackFt: analysis.sideSetbackFt,
    mapRearSetbackFt: analysis.rearSetbackFt,
    mapSeparationFt: analysis.separationFromPrimaryFt,
    mapSeparationFromGarageFt: analysis.separationFromGarageFt,
    mapMinStructureSeparationFt: analysis.minStructureSeparationFt,
    remainingBuildableSqFt: analysis.remainingBuildableSqFt,
    buildableConsumedPct: analysis.buildableConsumedPct,
    minAccessPassageFt: analysis.minAccessPassageFt,
    mapViolations: analysis.violations,
    mapDesignWarnings: analysis.designWarnings,
    floorAreaAnalysis: analysis.floorAreaAnalysis,
  };
}

export function getAduFootprint(sitePlan: SitePlanData): RectFootprint | undefined {
  return sitePlan.structures.find((s) => s.kind === "adu");
}

export function constrainAduToMaxFootprint(
  adu: Pick<RectFootprint, "centerXFt" | "centerYFt" | "widthFt" | "depthFt">,
  max: MaxAduFootprintResult
): Pick<RectFootprint, "centerXFt" | "centerYFt" | "widthFt" | "depthFt"> {
  const widthFt = Math.min(adu.widthFt, max.widthFt);
  const depthFt = Math.min(adu.depthFt, max.depthFt);

  const maxLeft = max.centerXFt - max.widthFt / 2;
  const maxRight = max.centerXFt + max.widthFt / 2;
  const maxBottom = max.centerYFt - max.depthFt / 2;
  const maxTop = max.centerYFt + max.depthFt / 2;

  const minCenterX = maxLeft + widthFt / 2;
  const maxCenterX = maxRight - widthFt / 2;
  const minCenterY = maxBottom + depthFt / 2;
  const maxCenterY = maxTop - depthFt / 2;

  const centerXFt =
    minCenterX <= maxCenterX
      ? Math.max(minCenterX, Math.min(maxCenterX, adu.centerXFt))
      : max.centerXFt;
  const centerYFt =
    minCenterY <= maxCenterY
      ? Math.max(minCenterY, Math.min(maxCenterY, adu.centerYFt))
      : max.centerYFt;

  return { centerXFt, centerYFt, widthFt, depthFt };
}

export function getAduPlacementBounds(
  max: MaxAduFootprintResult,
  aduWidthFt: number,
  aduDepthFt: number
): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  maxWidthFt: number;
  maxDepthFt: number;
} {
  const maxLeft = max.centerXFt - max.widthFt / 2;
  const maxRight = max.centerXFt + max.widthFt / 2;
  const maxBottom = max.centerYFt - max.depthFt / 2;
  const maxTop = max.centerYFt + max.depthFt / 2;
  const widthFt = Math.min(aduWidthFt, max.widthFt);
  const depthFt = Math.min(aduDepthFt, max.depthFt);

  return {
    minX: maxLeft + widthFt / 2,
    maxX: maxRight - widthFt / 2,
    minY: maxBottom + depthFt / 2,
    maxY: maxTop - depthFt / 2,
    maxWidthFt: max.widthFt,
    maxDepthFt: max.depthFt,
  };
}

export function updateAduFootprint(
  sitePlan: SitePlanData,
  patch: Partial<RectFootprint>,
  maxFootprint?: MaxAduFootprintResult | null
): SitePlanData {
  const existing = sitePlan.structures.find((s) => s.kind === "adu");
  const merged: RectFootprint = {
    id: existing?.id ?? uuidv4(),
    kind: "adu",
    centerXFt: existing?.centerXFt ?? 20,
    centerYFt: existing?.centerYFt ?? 60,
    widthFt: existing?.widthFt ?? 20,
    depthFt: existing?.depthFt ?? 24,
    rotationDeg: existing?.rotationDeg ?? 0,
    ...patch,
  };

  const constrained = maxFootprint
    ? { ...merged, ...constrainAduToMaxFootprint(merged, maxFootprint) }
    : merged;

  const structures = sitePlan.structures.some((s) => s.kind === "adu")
    ? sitePlan.structures.map((s) => (s.kind === "adu" ? constrained : s))
    : [...sitePlan.structures, constrained];

  return { ...sitePlan, structures };
}

export function buildSetbackEnvelopePolygon(
  sitePlan: SitePlanData,
  setbacks: { frontFt: number; sideFt: number; rearFt: number }
): ParcelPolygon | null {
  const { parcelGeoJson, origin, axisBearingDeg } = sitePlan;
  if (!parcelGeoJson || !origin || axisBearingDeg === undefined) {
    return null;
  }

  const { widthFt, depthFt } = estimateLotDimensions(
    parcelGeoJson,
    origin,
    axisBearingDeg
  );
  const x1 = setbacks.sideFt;
  const x2 = widthFt - setbacks.sideFt;
  const y1 = setbacks.frontFt;
  const y2 = depthFt - setbacks.rearFt;

  if (x2 <= x1 || y2 <= y1) return null;

  const corners = [
    fromLocalFeet(x1, y1, origin, axisBearingDeg),
    fromLocalFeet(x2, y1, origin, axisBearingDeg),
    fromLocalFeet(x2, y2, origin, axisBearingDeg),
    fromLocalFeet(x1, y2, origin, axisBearingDeg),
  ];
  const coords = corners.map((ll) => [ll.lng, ll.lat]);
  coords.push(coords[0]);
  return { type: "Polygon", coordinates: [coords] };
}

/** @deprecated Use buildNetBuildableZone — setback envelope only, ignores structures */
export const buildBuildableZonePolygon = buildSetbackEnvelopePolygon;

function subtractPolygon(
  base: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
  cut: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>
): GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null {
  return turf.difference(turf.featureCollection([base, cut]));
}

function subtractStructuresFromZone(
  zone: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
  sitePlan: SitePlanData,
  structureBufferFt: number
): GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> {
  const { origin, axisBearingDeg, structures } = sitePlan;
  if (!origin || axisBearingDeg === undefined) {
    return zone;
  }

  let result = zone;
  for (const structure of structures) {
    if (structure.kind === "adu") continue;
    const structPoly = structureToPolygon(structure, origin, axisBearingDeg);
    const exclusion =
      structureBufferFt > 0
        ? (bufferStructureForSeparation(structPoly, structureBufferFt) ??
          turf.polygon(structPoly.coordinates))
        : turf.polygon(structPoly.coordinates);
    const diff = subtractPolygon(result, exclusion);
    if (diff) {
      result = diff;
    }
  }

  return result;
}

function buildSetbackZoneClippedToParcel(
  sitePlan: SitePlanData,
  setbacks: { frontFt: number; sideFt: number; rearFt: number }
): GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null {
  const setbackPoly = buildSetbackEnvelopePolygon(sitePlan, setbacks);
  if (!setbackPoly) return null;

  const { parcelGeoJson } = sitePlan;
  let zone: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> =
    turf.polygon(setbackPoly.coordinates);

  if (parcelGeoJson) {
    const parcel = turf.polygon(parcelGeoJson.coordinates);
    const clipped = turf.intersect(turf.featureCollection([zone, parcel]));
    if (!clipped) return null;
    zone = clipped;
  }

  return zone;
}

/** Setback envelope clipped to parcel, minus existing structure footprints (map display). */
export function buildNetBuildableZone(
  sitePlan: SitePlanData,
  setbacks: { frontFt: number; sideFt: number; rearFt: number }
): GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null {
  const zone = buildSetbackZoneClippedToParcel(sitePlan, setbacks);
  if (!zone) return null;
  return subtractStructuresFromZone(zone, sitePlan, 0);
}

/** Placement zone for max ADU sizing — includes 5' face-to-face separation buffer. */
export function buildAduPlacementZone(
  sitePlan: SitePlanData,
  setbacks: { frontFt: number; sideFt: number; rearFt: number }
): GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null {
  const zone = buildSetbackZoneClippedToParcel(sitePlan, setbacks);
  if (!zone) return null;
  return subtractStructuresFromZone(zone, sitePlan, MIN_SEPARATION_FACE_FT);
}

function aduLocalBounds(
  cx: number,
  cy: number,
  widthFt: number,
  depthFt: number
): LocalBounds {
  return {
    minX: cx - widthFt / 2,
    maxX: cx + widthFt / 2,
    minY: cy - depthFt / 2,
    maxY: cy + depthFt / 2,
  };
}

function aduPreservesEgressAccess(
  sitePlan: SitePlanData,
  setbacks: { frontFt: number; sideFt: number; rearFt: number },
  cx: number,
  cy: number,
  widthFt: number,
  depthFt: number
): boolean {
  const baseline = measureMinAccessPassage(sitePlan, setbacks, MIN_SEPARATION_FACE_FT);
  // Only shrink max footprint when a code-min side passage already exists to protect.
  if (baseline < MIN_EGRESS_ACCESS_FT) return true;

  const withAdu = measureMinAccessPassage(sitePlan, setbacks, MIN_SEPARATION_FACE_FT, [
    aduLocalBounds(cx, cy, widthFt, depthFt),
  ]);
  return withAdu >= MIN_EGRESS_ACCESS_FT;
}

export interface MaxAduFootprintResult {
  centerXFt: number;
  centerYFt: number;
  widthFt: number;
  depthFt: number;
  areaSqFt: number;
}

function rectFitsInZone(
  cx: number,
  cy: number,
  widthFt: number,
  depthFt: number,
  origin: LatLng,
  axisBearingDeg: number,
  zone: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>
): boolean {
  const hw = widthFt / 2;
  const hd = depthFt / 2;
  const sampleStep = Math.min(2, Math.min(widthFt, depthFt) / 2);

  for (let x = -hw; x <= hw + 0.01; x += sampleStep) {
    for (let y = -hd; y <= hd + 0.01; y += sampleStep) {
      const ll = fromLocalFeet(cx + x, cy + y, origin, axisBearingDeg);
      if (
        !turf.booleanPointInPolygon(turf.point([ll.lng, ll.lat]), zone)
      ) {
        return false;
      }
    }
  }
  return true;
}

/** Largest axis-aligned rectangle that fits in the placement zone, capped by code max size. */
export function computeMaxAduFootprint(
  sitePlan: SitePlanData,
  setbacks: { frontFt: number; sideFt: number; rearFt: number },
  maxSqFt = 1000
): MaxAduFootprintResult | null {
  const zone = buildAduPlacementZone(sitePlan, setbacks);
  const { parcelGeoJson, origin, axisBearingDeg } = sitePlan;
  if (!zone || !parcelGeoJson || !origin || axisBearingDeg === undefined) {
    return null;
  }

  const { widthFt, depthFt } = estimateLotDimensions(
    parcelGeoJson,
    origin,
    axisBearingDeg
  );
  const gridStep = 2;
  const minDim = 10;
  const maxDim = Math.ceil(Math.sqrt(maxSqFt)) + 10;

  const xMin = setbacks.sideFt + minDim / 2;
  const xMax = widthFt - setbacks.sideFt - minDim / 2;
  const yMin = setbacks.frontFt + minDim / 2;
  const yMax = depthFt - setbacks.rearFt - minDim / 2;
  if (xMax <= xMin || yMax <= yMin) return null;

  let best: MaxAduFootprintResult | null = null;

  const tryCandidate = (cx: number, cy: number, widthFt: number, depthFt: number) => {
    const areaSqFt = widthFt * depthFt;
    if (areaSqFt > maxSqFt || (best && areaSqFt <= best.areaSqFt)) return;
    if (
      !rectFitsInZone(cx, cy, widthFt, depthFt, origin, axisBearingDeg, zone)
    ) {
      return;
    }
    if (
      !aduPreservesEgressAccess(sitePlan, setbacks, cx, cy, widthFt, depthFt)
    ) {
      return;
    }
    best = { centerXFt: cx, centerYFt: cy, widthFt, depthFt, areaSqFt };
  };

  const expandAt = (cx: number, cy: number) => {
    let w = minDim;
    let d = minDim;
    while (
      w + gridStep <= maxDim &&
      rectFitsInZone(cx, cy, w + gridStep, d, origin, axisBearingDeg, zone)
    ) {
      w += gridStep;
    }
    while (
      d + gridStep <= maxDim &&
      rectFitsInZone(cx, cy, w, d + gridStep, origin, axisBearingDeg, zone)
    ) {
      d += gridStep;
    }
    while (
      w + gridStep <= maxDim &&
      (w + gridStep) * d <= maxSqFt &&
      rectFitsInZone(cx, cy, w + gridStep, d, origin, axisBearingDeg, zone)
    ) {
      w += gridStep;
    }

    if (w * d <= maxSqFt) {
      tryCandidate(cx, cy, w, d);
    }

    // Also try common ADU aspect ratios at this center
    for (const ratio of [1, 1.2, 0.83, 1.5, 0.67]) {
      const tryW = Math.min(maxDim, Math.sqrt(maxSqFt * ratio));
      const tryD = Math.min(maxDim, maxSqFt / tryW);
      if (tryW >= minDim && tryD >= minDim) {
        tryCandidate(cx, cy, Math.round(tryW), Math.round(tryD));
      }
    }
  };

  for (let cy = yMin; cy <= yMax; cy += gridStep) {
    for (let cx = xMin; cx <= xMax; cx += gridStep) {
      expandAt(cx, cy);
    }
  }

  return best;
}

export function maxAduFootprintToPolygon(
  footprint: MaxAduFootprintResult,
  origin: LatLng,
  axisBearingDeg: number
): ParcelPolygon {
  return footprintToPolygon(
    {
      id: "max-adu",
      kind: "adu",
      centerXFt: footprint.centerXFt,
      centerYFt: footprint.centerYFt,
      widthFt: footprint.widthFt,
      depthFt: footprint.depthFt,
      rotationDeg: 0,
    },
    origin,
    axisBearingDeg
  );
}

export function parcelBBox(
  polygon: ParcelPolygon
): [number, number, number, number] {
  return turf.bbox(turf.polygon(polygon.coordinates)) as [
    number,
    number,
    number,
    number,
  ];
}
