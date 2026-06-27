import type { LatLng, ParcelPolygon } from "../types";
import { isPolygon } from "./geocode";

const PARCEL_LAYER =
  "https://public.gis.lacounty.gov/public/rest/services/LACounty_Cache/LACounty_Parcel/MapServer/0";

export interface LacountyParcelAttributes {
  AIN?: string;
  APN?: string;
  SitusFullAddress?: string;
  "Shape.STArea()"?: number;
  SQFTmain1?: string | number;
  YearBuilt1?: string;
  TaxRateCity?: string;
  UseDescription?: string;
  CENTER_LAT?: string;
  CENTER_LON?: string;
}

export interface LacountyParcelFeature {
  geometry: ParcelPolygon;
  properties: LacountyParcelAttributes;
}

function envelopeAround(point: LatLng, delta = 0.00035): string {
  const { lng, lat } = point;
  return `${lng - delta},${lat - delta},${lng + delta},${lat + delta}`;
}

function distanceSq(a: LatLng, b: LatLng): number {
  const dLat = a.lat - b.lat;
  const dLng = a.lng - b.lng;
  return dLat * dLat + dLng * dLng;
}

function parcelCentroid(ring: number[][]): LatLng {
  let lat = 0;
  let lng = 0;
  const n = ring.length - 1;
  for (let i = 0; i < n; i++) {
    lng += ring[i][0];
    lat += ring[i][1];
  }
  return { lat: lat / n, lng: lng / n };
}

export async function queryParcelsNearPoint(
  point: LatLng
): Promise<LacountyParcelFeature[]> {
  const params = new URLSearchParams({
    geometry: envelopeAround(point),
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields:
      "AIN,APN,SitusFullAddress,Shape.STArea(),SQFTmain1,YearBuilt1,TaxRateCity,UseDescription,CENTER_LAT,CENTER_LON",
    returnGeometry: "true",
    outSR: "4326",
    f: "geojson",
    resultRecordCount: "25",
  });

  const res = await fetch(`${PARCEL_LAYER}/query?${params}`);
  if (!res.ok) return [];

  const data = (await res.json()) as {
    features?: Array<{
      geometry: { type: string; coordinates: number[][][] };
      properties: LacountyParcelAttributes;
    }>;
  };

  const features: LacountyParcelFeature[] = [];
  for (const f of data.features ?? []) {
    if (!isPolygon(f.geometry)) continue;
    features.push({
      geometry: f.geometry,
      properties: f.properties,
    });
  }

  return features;
}

export function pickClosestParcel(
  parcels: LacountyParcelFeature[],
  point: LatLng
): LacountyParcelFeature | null {
  if (!parcels.length) return null;

  let best: LacountyParcelFeature | null = null;
  let bestDist = Infinity;

  for (const parcel of parcels) {
    const ring = parcel.geometry.coordinates[0];
    const centroid = parcelCentroid(ring);
    const centerLat = parcel.properties.CENTER_LAT
      ? parseFloat(parcel.properties.CENTER_LAT)
      : centroid.lat;
    const centerLng = parcel.properties.CENTER_LON
      ? parseFloat(parcel.properties.CENTER_LON)
      : centroid.lng;
    const dist = distanceSq(point, { lat: centerLat, lng: centerLng });
    if (dist < bestDist) {
      bestDist = dist;
      best = parcel;
    }
  }

  return best;
}

export async function fetchParcelByAin(
  ain: string
): Promise<LacountyParcelFeature | null> {
  const clean = ain.replace(/\D/g, "");
  const params = new URLSearchParams({
    where: `AIN='${clean}'`,
    outFields:
      "AIN,APN,SitusFullAddress,Shape.STArea(),SQFTmain1,YearBuilt1,TaxRateCity,UseDescription,CENTER_LAT,CENTER_LON",
    returnGeometry: "true",
    outSR: "4326",
    f: "geojson",
  });

  const res = await fetch(`${PARCEL_LAYER}/query?${params}`);
  if (!res.ok) return null;

  const data = (await res.json()) as {
    features?: Array<{
      geometry: { type: string; coordinates: number[][][] };
      properties: LacountyParcelAttributes;
    }>;
  };

  const f = data.features?.[0];
  if (!f || !isPolygon(f.geometry)) return null;

  return { geometry: f.geometry, properties: f.properties };
}
