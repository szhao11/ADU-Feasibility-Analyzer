import * as turf from "@turf/turf";
import type { LatLng, ParcelPolygon } from "../types";
import { matchPermitParkingStreet } from "./parking-streets";

const LA_COUNTY_HISTORIC_LAYER =
  "https://arcgis.gis.lacounty.gov/arcgis/rest/services/DRP/GISNET_Public/MapServer/331";

const LA_COUNTY_STREET_TREES_LAYER =
  "https://dpw.gis.lacounty.gov/dpw/rest/services/GIS_Web_Services/MapServer/3";

const LA_COUNTY_TREE_CANOPY_LAYER =
  "https://image.gis.lacounty.gov/image/rest/services/LARIAC7/TREE_CANOPY_2023/ImageServer";

/** Status codes indicating evaluated historic significance (OHP). */
const SIGNIFICANT_STATUS_PREFIXES = ["1", "2", "3", "4", "5"];

const STREET_TREE_BUFFER_FT = 75;
const HISTORIC_NEARBY_BUFFER_FT = 150;

export interface BuildingScreeningInput {
  primarySqFt?: number;
  lariacBuildingCount: number;
  lariacTotalSqFt: number;
}

export interface PermitParkingScreening {
  detected: boolean;
  zone?: string;
  street?: string;
}

export interface HistoricScreening {
  detected: boolean;
  resourceName?: string;
  statusCode?: string;
  matchType?: "apn" | "parcel" | "nearby";
}

export interface TreeScreening {
  streetTreesNearby: boolean;
  streetTreeCount: number;
  largeStreetTrees: number;
  canopyOnParcel: boolean;
}

export interface UnpermittedScreening {
  risk: boolean;
  note?: string;
}

function normalizeApn(value?: string): string {
  return (value ?? "").replace(/\D/g, "");
}

function apnMatches(recordApn: string | undefined, parcelApn?: string): boolean {
  const parcel = normalizeApn(parcelApn);
  if (!parcel || !recordApn) return false;

  const tokens = recordApn.split(/[,;\s]+/).map(normalizeApn).filter(Boolean);
  return tokens.some(
    (token) =>
      token === parcel ||
      token.endsWith(parcel) ||
      parcel.endsWith(token) ||
      (token.length >= 8 && parcel.includes(token.slice(-8)))
  );
}

function isSignificantHistoric(statusCode?: string | null): boolean {
  if (!statusCode) return true;
  const code = statusCode.trim();
  return SIGNIFICANT_STATUS_PREFIXES.some((prefix) => code.startsWith(prefix));
}

async function queryHistoricLayer(params: URLSearchParams): Promise<
  Array<{
    Name?: string;
    Status_Code?: string;
    APN?: string;
    Address_Location?: string;
    Jurisdiction?: string;
    City_Unin_Community?: string;
  }>
> {
  try {
    const res = await fetch(`${LA_COUNTY_HISTORIC_LAYER}/query?${params}`);
    if (!res.ok) return [];

    const data = (await res.json()) as {
      features?: Array<{ attributes: Record<string, string | null | undefined> }>;
    };

    return (data.features ?? []).map((f) => f.attributes);
  } catch {
    return [];
  }
}

export async function lookupHistoricResources(
  point: LatLng,
  parcel?: ParcelPolygon,
  apn?: string
): Promise<HistoricScreening> {
  if (parcel) {
    const parcelParams = new URLSearchParams({
      geometry: JSON.stringify({
        rings: parcel.coordinates,
        spatialReference: { wkid: 4326 },
      }),
      geometryType: "esriGeometryPolygon",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "Name,Status_Code,APN,Address_Location,Jurisdiction,City_Unin_Community",
      returnGeometry: "false",
      f: "json",
      resultRecordCount: "10",
    });

    const onParcel = await queryHistoricLayer(parcelParams);
    const parcelHit = onParcel.find(
      (r) =>
        isSignificantHistoric(r.Status_Code) &&
        (apnMatches(r.APN, apn) ||
          (r.Jurisdiction ?? "").toLowerCase().includes("burbank") ||
          (r.City_Unin_Community ?? "").toLowerCase().includes("burbank") ||
          (r.Address_Location ?? "").toLowerCase().includes("burbank"))
    );
    if (parcelHit) {
      return {
        detected: true,
        resourceName: parcelHit.Name,
        statusCode: parcelHit.Status_Code ?? undefined,
        matchType: apnMatches(parcelHit.APN, apn) ? "apn" : "parcel",
      };
    }
  }

  if (apn) {
    const digits = normalizeApn(apn);
    if (digits.length >= 8) {
      const apnParams = new URLSearchParams({
        where: `APN LIKE '%${digits.slice(-8)}%'`,
        outFields: "Name,Status_Code,APN,Address_Location,Jurisdiction",
        returnGeometry: "false",
        f: "json",
        resultRecordCount: "5",
      });
      const apnHits = await queryHistoricLayer(apnParams);
      const apnHit = apnHits.find((r) => apnMatches(r.APN, apn));
      if (apnHit) {
        return {
          detected: true,
          resourceName: apnHit.Name,
          statusCode: apnHit.Status_Code ?? undefined,
          matchType: "apn",
        };
      }
    }
  }

  const nearbyParams = new URLSearchParams({
    geometry: `${point.lng},${point.lat}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    distance: String(HISTORIC_NEARBY_BUFFER_FT),
    units: "esriSRUnit_Foot",
    outFields: "Name,Status_Code,APN,Address_Location,Jurisdiction,City_Unin_Community",
    returnGeometry: "false",
    f: "json",
    resultRecordCount: "10",
  });

  const nearby = await queryHistoricLayer(nearbyParams);
  const nearbyHit = nearby.find(
    (r) =>
      isSignificantHistoric(r.Status_Code) &&
      ((r.Address_Location ?? "").toLowerCase().includes("burbank") ||
        (r.Jurisdiction ?? "").toLowerCase().includes("burbank") ||
        (r.City_Unin_Community ?? "").toLowerCase().includes("burbank") ||
        apnMatches(r.APN, apn))
  );

  if (nearbyHit) {
    return {
      detected: true,
      resourceName: nearbyHit.Name,
      statusCode: nearbyHit.Status_Code ?? undefined,
      matchType: "nearby",
    };
  }

  return { detected: false };
}

export function lookupPermitParkingDistrict(address: string): PermitParkingScreening {
  const match = matchPermitParkingStreet(address);
  if (!match.matched) return { detected: false };
  return {
    detected: true,
    zone: match.zone,
    street: match.street,
  };
}

async function queryStreetTreesNearParcel(
  parcel: ParcelPolygon
): Promise<Array<{ diameter?: number; species?: string }>> {
  const params = new URLSearchParams({
    geometry: JSON.stringify({
      rings: parcel.coordinates,
      spatialReference: { wkid: 4326 },
    }),
    geometryType: "esriGeometryPolygon",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    distance: String(STREET_TREE_BUFFER_FT),
    units: "esriSRUnit_Foot",
    outFields: "DIAMETER,SPECIES",
    returnGeometry: "false",
    f: "json",
    resultRecordCount: "25",
  });

  try {
    const res = await fetch(`${LA_COUNTY_STREET_TREES_LAYER}/query?${params}`);
    if (!res.ok) return [];

    const data = (await res.json()) as {
      features?: Array<{
        attributes: { DIAMETER?: number; SPECIES?: string };
      }>;
    };

    return (data.features ?? []).map((f) => ({
      diameter: f.attributes.DIAMETER,
      species: f.attributes.SPECIES,
    }));
  } catch {
    return [];
  }
}

function samplePointsOnParcel(parcel: ParcelPolygon): LatLng[] {
  const poly = turf.polygon(parcel.coordinates);
  const centroid = turf.centroid(poly);
  const bbox = turf.bbox(poly);
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const midLng = (minLng + maxLng) / 2;
  const midLat = (minLat + maxLat) / 2;

  return [
    { lng: centroid.geometry.coordinates[0], lat: centroid.geometry.coordinates[1] },
    { lng: minLng, lat: minLat },
    { lng: maxLng, lat: minLat },
    { lng: minLng, lat: maxLat },
    { lng: maxLng, lat: maxLat },
    { lng: midLng, lat: midLat },
  ];
}

async function sampleTreeCanopyOnParcel(parcel: ParcelPolygon): Promise<boolean> {
  const points = samplePointsOnParcel(parcel);
  const bbox = turf.bbox(turf.polygon(parcel.coordinates));
  const mapExtent = `${bbox[0]},${bbox[1]},${bbox[2]},${bbox[3]}`;

  for (const point of points) {
    const params = new URLSearchParams({
      geometry: `${point.lng},${point.lat}`,
      geometryType: "esriGeometryPoint",
      inSR: "4326",
      mapExtent,
      imageDisplay: "800,600,96",
      returnGeometry: "false",
      f: "json",
    });

    try {
      const res = await fetch(
        `${LA_COUNTY_TREE_CANOPY_LAYER}/identify?${params}`
      );
      if (!res.ok) continue;

      const data = (await res.json()) as { value?: string | number };
      const raw = data.value;
      if (raw === undefined || raw === null || raw === "NoData") continue;

      const numeric = typeof raw === "number" ? raw : parseFloat(String(raw));
      if (Number.isFinite(numeric) && numeric > 0) {
        return true;
      }
    } catch {
      continue;
    }
  }

  return false;
}

export async function lookupTreeScreening(
  parcel?: ParcelPolygon
): Promise<TreeScreening> {
  if (!parcel) {
    return {
      streetTreesNearby: false,
      streetTreeCount: 0,
      largeStreetTrees: 0,
      canopyOnParcel: false,
    };
  }

  const [trees, canopyOnParcel] = await Promise.all([
    queryStreetTreesNearParcel(parcel),
    sampleTreeCanopyOnParcel(parcel),
  ]);

  const largeStreetTrees = trees.filter(
    (t) => (t.diameter ?? 0) >= 24
  ).length;

  return {
    streetTreesNearby: trees.length > 0,
    streetTreeCount: trees.length,
    largeStreetTrees,
    canopyOnParcel,
  };
}

export function assessUnpermittedStructureRisk(
  input: BuildingScreeningInput
): UnpermittedScreening {
  const { primarySqFt, lariacBuildingCount, lariacTotalSqFt } = input;

  if (lariacBuildingCount === 0) {
    return { risk: false };
  }

  if (!primarySqFt || primarySqFt <= 0) {
    return {
      risk: true,
      note: `LARIAC shows ${lariacBuildingCount} structure(s) (~${Math.round(lariacTotalSqFt).toLocaleString()} sf) but Assessor improved area is missing or zero`,
    };
  }

  const ratio = lariacTotalSqFt / primarySqFt;
  if (ratio > 1.2) {
    return {
      risk: true,
      note: `LARIAC footprint ~${Math.round(lariacTotalSqFt).toLocaleString()} sf vs Assessor improved ~${Math.round(primarySqFt).toLocaleString()} sf — verify all structures are permitted`,
    };
  }

  if (lariacBuildingCount > 2) {
    return {
      risk: true,
      note: `${lariacBuildingCount} structures detected on lot — confirm all are permitted before ADU work`,
    };
  }

  return { risk: false };
}
