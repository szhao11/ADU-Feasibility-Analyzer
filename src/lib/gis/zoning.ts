import type { BurbankZone, LatLng } from "../types";

const SCAG_ZONING_LAYER =
  "https://maps.scag.ca.gov/scaggis/rest/services/LDX/Zoning_poly_LA/MapServer/0";

const ZONE_MAP: Record<string, BurbankZone> = {
  "R-1": "R-1",
  "R-1-H": "R-1-H",
  "R-2": "R2",
  "R-3": "R3",
  "R-4": "R4",
  "MDR-3": "MDR-3",
  "MDR-4": "MDR-4",
};

export interface ZoningLookupResult {
  rawZone: string;
  zone: BurbankZone;
  city?: string;
  source: "scag_ldx";
  year?: string;
}

interface ScagZoningAttributes {
  ZN24_CITY?: string;
  CITY?: string;
  APN24?: string;
  YEAR_ZN?: string | number;
}

export function normalizeApnDigits(apnOrAin: string): string {
  return apnOrAin.replace(/\D/g, "");
}

export function normalizeBurbankZone(raw: string): BurbankZone {
  const trimmed = raw.trim();
  if (ZONE_MAP[trimmed]) return ZONE_MAP[trimmed];

  const upper = trimmed.toUpperCase();
  const match = Object.keys(ZONE_MAP).find((k) => k.toUpperCase() === upper);
  return match ? ZONE_MAP[match] : "OTHER";
}

function formatZoningYear(value: string | number | undefined): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "number" && value > 1_000_000_000_000) {
    const year = new Date(value).getUTCFullYear();
    return year >= 1990 ? String(year) : undefined;
  }
  const text = String(value).trim();
  return text || undefined;
}

function parseZoningFeature(
  attrs: ScagZoningAttributes
): ZoningLookupResult | null {
  const rawZone = attrs.ZN24_CITY?.trim();
  if (!rawZone) return null;

  return {
    rawZone,
    zone: normalizeBurbankZone(rawZone),
    city: attrs.CITY?.trim(),
    source: "scag_ldx",
    year: formatZoningYear(attrs.YEAR_ZN),
  };
}

async function queryZoning(
  params: URLSearchParams
): Promise<ZoningLookupResult | null> {
  params.set(
    "outFields",
    "ZN24_CITY,CITY,APN24,YEAR_ZN"
  );
  params.set("returnGeometry", "false");
  params.set("f", "json");
  params.set("resultRecordCount", "5");

  const res = await fetch(`${SCAG_ZONING_LAYER}/query?${params}`);
  if (!res.ok) return null;

  const data = (await res.json()) as {
    features?: Array<{ attributes: ScagZoningAttributes }>;
    error?: { message?: string };
  };

  if (data.error) return null;

  for (const feature of data.features ?? []) {
    const parsed = parseZoningFeature(feature.attributes);
    if (parsed) return parsed;
  }

  return null;
}

export async function lookupZoningByApn(
  apnOrAin: string
): Promise<ZoningLookupResult | null> {
  const digits = normalizeApnDigits(apnOrAin);
  if (!digits) return null;

  const params = new URLSearchParams({
    where: `APN24='${digits}'`,
  });

  return queryZoning(params);
}

export async function lookupZoningByPoint(
  point: LatLng
): Promise<ZoningLookupResult | null> {
  const params = new URLSearchParams({
    geometry: `${point.lng},${point.lat}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
  });

  return queryZoning(params);
}

export async function lookupBurbankZoning(options: {
  apnOrAin?: string;
  point?: LatLng;
}): Promise<ZoningLookupResult | null> {
  if (options.apnOrAin) {
    const byApn = await lookupZoningByApn(options.apnOrAin);
    if (byApn) return byApn;
  }

  if (options.point) {
    return lookupZoningByPoint(options.point);
  }

  return null;
}
