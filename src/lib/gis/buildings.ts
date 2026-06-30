import type { ParcelPolygon } from "../types";
import { isPolygon } from "./geocode";

const BUILDINGS_LAYER =
  "https://rpgis.isd.lacounty.gov/arcgis/rest/services/GISNET_Public/MapServer/434";

export interface LacountyBuildingFeature {
  geometry: ParcelPolygon;
  areaSqFt: number;
  heightFt?: number;
}

export async function queryBuildingsOnParcel(
  polygon: ParcelPolygon
): Promise<LacountyBuildingFeature[]> {
  const geometry = JSON.stringify({
    rings: polygon.coordinates,
    spatialReference: { wkid: 4326 },
  });

  const params = new URLSearchParams({
    geometry,
    geometryType: "esriGeometryPolygon",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "HEIGHT,Shape.STArea()",
    returnGeometry: "true",
    outSR: "4326",
    f: "geojson",
    resultRecordCount: "25",
  });

  const res = await fetch(`${BUILDINGS_LAYER}/query?${params}`);
  if (!res.ok) return [];

  const data = (await res.json()) as {
    features?: Array<{
      geometry: { type: string; coordinates: number[][][] };
      properties: Record<string, number | string | undefined>;
    }>;
  };

  const buildings: LacountyBuildingFeature[] = [];
  for (const feature of data.features ?? []) {
    if (!isPolygon(feature.geometry)) continue;
    const area = feature.properties["Shape.STArea()"];
    const areaSqFt = typeof area === "number" ? area : parseFloat(String(area ?? ""));
    if (!Number.isFinite(areaSqFt) || areaSqFt < 120) continue;

    const height = feature.properties.HEIGHT;
    buildings.push({
      geometry: feature.geometry,
      areaSqFt,
      heightFt:
        typeof height === "number"
          ? height
          : height
            ? parseFloat(String(height))
            : undefined,
    });
  }

  return buildings.sort((a, b) => b.areaSqFt - a.areaSqFt);
}
