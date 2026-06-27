import * as turf from "@turf/turf";
import { v4 as uuidv4 } from "uuid";
import type {
  EnvelopeData,
  LatLng,
  ParcelPolygon,
  RectFootprint,
  SitePlanData,
} from "../types";

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
  proposedSqFt: number;
  violations: string[];
  withinParcel: boolean;
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

function minDistanceToRect(
  rect: { x: number; y: number }[],
  edgeA: { x: number; y: number },
  edgeB: { x: number; y: number }
): number {
  let min = Infinity;
  for (const p of rect) {
    min = Math.min(min, pointToSegmentDistance(p, edgeA, edgeB));
  }
  for (let i = 0; i < rect.length; i++) {
    const a = rect[i];
    const b = rect[(i + 1) % rect.length];
    min = Math.min(min, pointToSegmentDistance(edgeA, a, b));
    min = Math.min(min, pointToSegmentDistance(edgeB, a, b));
  }
  return min;
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
  const bearing = turf.bearing(turf.point(a), turf.point(b));
  const origin = { lat: a[1], lng: a[0] };

  return {
    origin,
    axisBearingDeg: bearing,
    frontEdgeIndex: bestEdge,
  };
}

export function estimateLotDimensions(
  polygon: ParcelPolygon,
  origin: LatLng,
  axisBearingDeg: number
): LotDimensions {
  const ring = polygon.coordinates[0];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const coord of ring) {
    const local = toLocalFeet({ lat: coord[1], lng: coord[0] }, origin, axisBearingDeg);
    minX = Math.min(minX, local.x);
    maxX = Math.max(maxX, local.x);
    minY = Math.min(minY, local.y);
    maxY = Math.max(maxY, local.y);
  }

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

function classifyEdges(
  polygon: ParcelPolygon,
  origin: LatLng,
  axisBearingDeg: number,
  frontEdgeIndex: number
): Array<"front" | "rear" | "side"> {
  const ring = polygon.coordinates[0];
  const n = ring.length - 1;
  const types: Array<"front" | "rear" | "side"> = [];

  for (let i = 0; i < n; i++) {
    if (i === frontEdgeIndex) {
      types.push("front");
      continue;
    }
    const a = toLocalFeet(
      { lat: ring[i][1], lng: ring[i][0] },
      origin,
      axisBearingDeg
    );
    const b = toLocalFeet(
      { lat: ring[i + 1][1], lng: ring[i + 1][0] },
      origin,
      axisBearingDeg
    );
    const midY = (a.y + b.y) / 2;
    types.push(midY > 5 ? "rear" : "side");
  }

  return types;
}

export function analyzeSitePlan(
  sitePlan: SitePlanData,
  frontSetbackFt = 20
): EnvelopeAnalysis | null {
  const { parcelGeoJson, origin, axisBearingDeg, structures } = sitePlan;
  if (!parcelGeoJson || !origin || axisBearingDeg === undefined) {
    return null;
  }

  const adu = structures.find((s) => s.kind === "adu");
  const primary = structures.find((s) => s.kind === "primary");
  if (!adu) return null;

  const ring = parcelGeoJson.coordinates[0];
  const edgeTypes = classifyEdges(
    parcelGeoJson,
    origin,
    axisBearingDeg,
    sitePlan.frontEdgeIndex ?? 0
  );

  const aduRect = rectCorners(adu);
  let minSide = Infinity;
  let minRear = Infinity;
  let minFront = Infinity;

  for (let i = 0; i < ring.length - 1; i++) {
    const aLocal = toLocalFeet(
      { lat: ring[i][1], lng: ring[i][0] },
      origin,
      axisBearingDeg
    );
    const bLocal = toLocalFeet(
      { lat: ring[i + 1][1], lng: ring[i + 1][0] },
      origin,
      axisBearingDeg
    );
    const dist = minDistanceToRect(aduRect, aLocal, bLocal);
    const type = edgeTypes[i];
    if (type === "side") minSide = Math.min(minSide, dist);
    if (type === "rear") minRear = Math.min(minRear, dist);
    if (type === "front") minFront = Math.min(minFront, dist);
  }

  let separation = Infinity;
  if (primary) {
    separation = minRectToRect(aduRect, rectCorners(primary));
  }

  const violations: string[] = [];
  const MIN_SIDE = 4;
  const MIN_REAR = 4;
  const MIN_SEP = 5;

  if (minSide < MIN_SIDE) {
    violations.push(`Side setback ${minSide.toFixed(1)}' < ${MIN_SIDE}' minimum`);
  }
  if (minRear < MIN_REAR) {
    violations.push(`Rear setback ${minRear.toFixed(1)}' < ${MIN_REAR}' minimum`);
  }
  if (minFront < frontSetbackFt) {
    violations.push(
      `Front setback ${minFront.toFixed(1)}' < ${frontSetbackFt}' prevailing`
    );
  }
  if (primary && separation < MIN_SEP) {
    violations.push(
      `Primary separation ${separation.toFixed(1)}' < ${MIN_SEP}' face-to-face`
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
    sideSetbackFt: Number.isFinite(minSide) ? minSide : 0,
    rearSetbackFt: Number.isFinite(minRear) ? minRear : 0,
    separationFromPrimaryFt: Number.isFinite(separation) ? separation : 0,
    proposedSqFt: adu.widthFt * adu.depthFt,
    violations,
    withinParcel,
  };
}

export function syncEnvelopeFromSitePlan(
  sitePlan: SitePlanData,
  envelope: EnvelopeData,
  frontSetbackFt?: number
): EnvelopeData {
  const analysis = analyzeSitePlan(sitePlan, frontSetbackFt);
  if (!analysis) return envelope;

  return {
    ...envelope,
    proposedSqFt: analysis.proposedSqFt,
    sideSetbackFt: analysis.sideSetbackFt,
    rearSetbackFt: analysis.rearSetbackFt,
    separationFromPrimaryFt: analysis.separationFromPrimaryFt,
    mapSideSetbackFt: analysis.sideSetbackFt,
    mapRearSetbackFt: analysis.rearSetbackFt,
    mapSeparationFt: analysis.separationFromPrimaryFt,
    mapViolations: analysis.violations,
  };
}

export function getAduFootprint(sitePlan: SitePlanData): RectFootprint | undefined {
  return sitePlan.structures.find((s) => s.kind === "adu");
}

export function updateAduFootprint(
  sitePlan: SitePlanData,
  patch: Partial<RectFootprint>
): SitePlanData {
  const structures = sitePlan.structures.map((s) =>
    s.kind === "adu" ? { ...s, ...patch } : s
  );
  if (!structures.some((s) => s.kind === "adu")) {
    structures.push({
      id: uuidv4(),
      kind: "adu",
      centerXFt: 20,
      centerYFt: 60,
      widthFt: 20,
      depthFt: 24,
      rotationDeg: 0,
      ...patch,
    });
  }
  return { ...sitePlan, structures };
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
