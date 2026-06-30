"use client";

import { useEffect, useRef, useCallback } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FeasibilityProject } from "@/lib/types";
import {
  structureToPolygon,
  parcelBBox,
  getAduFootprint,
  buildNetBuildableZone,
  computeMaxAduFootprint,
  maxAduFootprintToPolygon,
} from "@/lib/geometry/site-plan";
import {
  getDefaultSetbacks,
  getMaxAduSqFt,
} from "@/lib/rules/envelope-requirements";

export function SiteEnvelopeMap({
  project,
}: {
  project: FeasibilityProject;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  const buildGeoJson = useCallback(() => {
    const { sitePlan } = project;
    const features: GeoJSON.Feature[] = [];

    if (sitePlan.parcelGeoJson) {
      features.push({
        type: "Feature",
        properties: { kind: "parcel" },
        geometry: sitePlan.parcelGeoJson,
      });

      const setbacks = getDefaultSetbacks(project);
      const buildable = buildNetBuildableZone(sitePlan, setbacks);
      if (buildable) {
        features.push({
          type: "Feature",
          properties: { kind: "buildable" },
          geometry: buildable.geometry,
        });
      }

      const maxSqFt = getMaxAduSqFt(project);
      const maxFootprint = computeMaxAduFootprint(sitePlan, setbacks, maxSqFt);
      if (
        maxFootprint &&
        sitePlan.origin &&
        sitePlan.axisBearingDeg !== undefined
      ) {
        features.push({
          type: "Feature",
          properties: {
            kind: "max-adu",
            areaSqFt: maxFootprint.areaSqFt,
            widthFt: maxFootprint.widthFt,
            depthFt: maxFootprint.depthFt,
          },
          geometry: maxAduFootprintToPolygon(
            maxFootprint,
            sitePlan.origin,
            sitePlan.axisBearingDeg
          ),
        });
      }
    }

    if (sitePlan.origin && sitePlan.axisBearingDeg !== undefined) {
      for (const s of sitePlan.structures) {
        features.push({
          type: "Feature",
          properties: { kind: s.kind, id: s.id },
          geometry: structureToPolygon(
            s,
            sitePlan.origin,
            sitePlan.axisBearingDeg
          ),
        });
      }
    }

    if (sitePlan.geocode) {
      features.push({
        type: "Feature",
        properties: { kind: "geocode" },
        geometry: {
          type: "Point",
          coordinates: [sitePlan.geocode.lng, sitePlan.geocode.lat],
        },
      });
    }

    return { type: "FeatureCollection" as const, features };
  }, [project]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "© OpenStreetMap",
          },
        },
        layers: [
          {
            id: "osm",
            type: "raster",
            source: "osm",
          },
        ],
      },
      center: [-118.31, 34.18],
      zoom: 17,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");

    map.on("load", () => {
      map.addSource("site", {
        type: "geojson",
        data: buildGeoJson(),
      });

      map.addLayer({
        id: "parcel-fill",
        type: "fill",
        source: "site",
        filter: ["==", ["get", "kind"], "parcel"],
        paint: { "fill-color": "#e2e8f0", "fill-opacity": 0.45 },
      });

      map.addLayer({
        id: "buildable-fill",
        type: "fill",
        source: "site",
        filter: ["==", ["get", "kind"], "buildable"],
        paint: { "fill-color": "#fef08a", "fill-opacity": 0.35 },
      });

      map.addLayer({
        id: "buildable-line",
        type: "line",
        source: "site",
        filter: ["==", ["get", "kind"], "buildable"],
        paint: {
          "line-color": "#ca8a04",
          "line-width": 2,
          "line-dasharray": [4, 3],
        },
      });

      map.addLayer({
        id: "max-adu-fill",
        type: "fill",
        source: "site",
        filter: ["==", ["get", "kind"], "max-adu"],
        paint: { "fill-color": "#14b8a6", "fill-opacity": 0.25 },
      });

      map.addLayer({
        id: "max-adu-line",
        type: "line",
        source: "site",
        filter: ["==", ["get", "kind"], "max-adu"],
        paint: {
          "line-color": "#0d9488",
          "line-width": 2.5,
          "line-dasharray": [2, 2],
        },
      });

      map.addLayer({
        id: "parcel-line",
        type: "line",
        source: "site",
        filter: ["==", ["get", "kind"], "parcel"],
        paint: { "line-color": "#334155", "line-width": 2 },
      });

      map.addLayer({
        id: "primary-fill",
        type: "fill",
        source: "site",
        filter: ["==", ["get", "kind"], "primary"],
        paint: { "fill-color": "#64748b", "fill-opacity": 0.7 },
      });

      map.addLayer({
        id: "garage-fill",
        type: "fill",
        source: "site",
        filter: ["==", ["get", "kind"], "garage"],
        paint: { "fill-color": "#94a3b8", "fill-opacity": 0.7 },
      });

      map.addLayer({
        id: "adu-fill",
        type: "fill",
        source: "site",
        filter: ["==", ["get", "kind"], "adu"],
        paint: { "fill-color": "#0f766e", "fill-opacity": 0.75 },
      });

      map.addLayer({
        id: "adu-line",
        type: "line",
        source: "site",
        filter: ["==", ["get", "kind"], "adu"],
        paint: { "line-color": "#134e4a", "line-width": 2 },
      });

      map.addLayer({
        id: "geocode-point",
        type: "circle",
        source: "site",
        filter: ["==", ["get", "kind"], "geocode"],
        paint: {
          "circle-radius": 5,
          "circle-color": "#dc2626",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#fff",
        },
      });

      const parcel = project.sitePlan.parcelGeoJson;
      if (parcel) {
        const bbox = parcelBBox(parcel);
        map.fitBounds(
          [
            [bbox[0], bbox[1]],
            [bbox[2], bbox[3]],
          ],
          { padding: 48, maxZoom: 19, duration: 0 }
        );
      }
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const source = map.getSource("site") as maplibregl.GeoJSONSource | undefined;
    if (source) {
      source.setData(buildGeoJson());
    }

    const parcel = project.sitePlan.parcelGeoJson;
    if (parcel) {
      const bbox = parcelBBox(parcel);
      map.fitBounds(
        [
          [bbox[0], bbox[1]],
          [bbox[2], bbox[3]],
        ],
        { padding: 48, maxZoom: 19, duration: 500 }
      );
    }
  }, [project.sitePlan, project.property, project.intent, buildGeoJson]);

  if (!project.sitePlan.parcelGeoJson) {
    return (
      <div className="flex h-80 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
        Run parcel lookup on the Property step to load the site map.
      </div>
    );
  }

  const adu = getAduFootprint(project.sitePlan);
  const setbacks = getDefaultSetbacks(project);
  const maxSqFt = getMaxAduSqFt(project);
  const maxFootprint = computeMaxAduFootprint(
    project.sitePlan,
    setbacks,
    maxSqFt
  );

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        className="h-80 w-full overflow-hidden rounded-lg border border-slate-200"
      />
      <div className="flex flex-wrap gap-3 text-[10px] text-slate-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm border border-amber-600 bg-amber-100" />
          Buildable zone ({setbacks.sideFt}&apos; side / {setbacks.rearFt}&apos;
          rear / {setbacks.frontFt}&apos; front, minus structures)
        </span>
        {maxFootprint && (
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm border border-dashed border-teal-600 bg-teal-200" />
            Max ADU footprint ({maxFootprint.widthFt}×{maxFootprint.depthFt}{" "}
            ft, {maxFootprint.areaSqFt} sf — 5&apos; separation + egress)
          </span>
        )}
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-slate-500" />
          Primary
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-slate-400" />
          Garage
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-teal-700" />
          ADU
        </span>
        {adu && (
          <span className="ml-auto font-mono text-slate-600">
            ADU {adu.widthFt}×{adu.depthFt} ft @ ({adu.centerXFt.toFixed(0)},{" "}
            {adu.centerYFt.toFixed(0)})
          </span>
        )}
      </div>
    </div>
  );
}
