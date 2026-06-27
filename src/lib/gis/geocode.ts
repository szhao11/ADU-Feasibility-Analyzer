import type { LatLng, ParcelPolygon } from "../types";

const NOMINATIM = "https://nominatim.openstreetmap.org/search";

export async function geocodeAddress(
  address: string
): Promise<LatLng | null> {
  const query = address.toLowerCase().includes("burbank")
    ? address
    : `${address}, Burbank, CA`;

  const params = new URLSearchParams({
    q: query,
    format: "json",
    limit: "1",
    countrycodes: "us",
  });

  const res = await fetch(`${NOMINATIM}?${params}`, {
    headers: { Accept: "application/json" },
  });

  if (!res.ok) return null;

  const results = (await res.json()) as Array<{ lat: string; lon: string }>;
  if (!results.length) return null;

  return {
    lat: parseFloat(results[0].lat),
    lng: parseFloat(results[0].lon),
  };
}

export function isPolygon(
  geometry: { type: string; coordinates: unknown }
): geometry is ParcelPolygon {
  return geometry.type === "Polygon" && Array.isArray(geometry.coordinates);
}
