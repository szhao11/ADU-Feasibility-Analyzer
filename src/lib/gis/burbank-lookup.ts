import { v4 as uuidv4 } from "uuid";
import type {
  BurbankZone,
  LatLng,
  ParcelLookupResult,
  PropertyData,
  RectFootprint,
  SitePlanData,
} from "../types";
import { geocodeAddress } from "./geocode";
import {
  fetchParcelByAin,
  pickClosestParcel,
  queryParcelsNearPoint,
  type LacountyParcelFeature,
} from "./parcel";
import { lookupBurbankZoning } from "./zoning";
import {
  createDefaultSitePlan,
  orientParcel,
  estimateLotDimensions,
  polygonToLocalRect,
  computeMaxAduFootprint,
  constrainAduToMaxFootprint,
  suggestAduPlacement,
} from "../geometry/site-plan";
import { queryBuildingsOnParcel, type LacountyBuildingFeature } from "./buildings";
import { lookupBurbankOverlays } from "./burbank-overlays";
import { syncPropertyFromSitePlan } from "../property/sync-from-site-plan";

function parseSqFt(value: string | number | undefined): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = typeof value === "number" ? value : parseFloat(value);
  return Number.isFinite(n) ? n : undefined;
}

function buildingToStructure(
  building: LacountyBuildingFeature,
  kind: RectFootprint["kind"],
  origin: LatLng,
  axisBearingDeg: number
): RectFootprint {
  const rect = polygonToLocalRect(building.geometry, origin, axisBearingDeg);
  return {
    id: uuidv4(),
    kind,
    ...rect,
    footprintGeoJson: building.geometry,
  };
}

function classifyGarage(
  buildings: LacountyBuildingFeature[],
  primary?: LacountyBuildingFeature
): LacountyBuildingFeature | undefined {
  if (!primary) return undefined;
  return buildings.find(
    (b) =>
      b !== primary &&
      b.areaSqFt >= 200 &&
      b.areaSqFt <= primary.areaSqFt * 0.65
  );
}

function buildHeuristicStructures(
  dims: { widthFt: number; depthFt: number },
  primarySqFt?: number
): RectFootprint[] {
  const structures: RectFootprint[] = [];

  const primaryWidth = Math.min(dims.widthFt * 0.55, 45);
  const primaryDepth = Math.min(
    primarySqFt ? primarySqFt / primaryWidth : dims.depthFt * 0.35,
    dims.depthFt * 0.5
  );

  structures.push({
    id: uuidv4(),
    kind: "primary",
    centerXFt: dims.widthFt / 2,
    centerYFt: primaryDepth / 2 + 8,
    widthFt: primaryWidth,
    depthFt: primaryDepth,
    rotationDeg: 0,
  });

  structures.push({
    id: uuidv4(),
    kind: "garage",
    centerXFt: dims.widthFt * 0.72,
    centerYFt: 10,
    widthFt: 22,
    depthFt: 20,
    rotationDeg: 0,
  });

  return structures;
}

async function buildSitePlanFromParcel(
  parcel: LacountyParcelFeature,
  geocode: LatLng
): Promise<{
  sitePlan: SitePlanData;
  lariacBuildingCount: number;
  lariacTotalSqFt: number;
}> {
  const orientation = orientParcel(parcel.geometry, geocode);
  const primarySqFt = parseSqFt(parcel.properties.SQFTmain1);
  const dims = estimateLotDimensions(
    parcel.geometry,
    orientation.origin,
    orientation.axisBearingDeg
  );

  const buildings = await queryBuildingsOnParcel(parcel.geometry);
  const structures: RectFootprint[] = [];
  let usedGisFootprints = false;

  if (buildings.length > 0) {
    usedGisFootprints = true;
    const primaryBuilding = buildings[0];
    const garageBuilding = classifyGarage(buildings, primaryBuilding);

    structures.push(
      buildingToStructure(
        primaryBuilding,
        "primary",
        orientation.origin,
        orientation.axisBearingDeg
      )
    );

    if (garageBuilding) {
      structures.push(
        buildingToStructure(
          garageBuilding,
          "garage",
          orientation.origin,
          orientation.axisBearingDeg
        )
      );
    }
  } else {
    structures.push(...buildHeuristicStructures(dims, primarySqFt));
  }

  const aduWidth = 20;
  const aduDepth = 24;
  const setbacks = { frontFt: 20, sideFt: 4, rearFt: 4 };
  const draftPlan: SitePlanData = {
    parcelGeoJson: parcel.geometry,
    geocode,
    origin: orientation.origin,
    axisBearingDeg: orientation.axisBearingDeg,
    frontEdgeIndex: orientation.frontEdgeIndex,
    structures,
    lookupSource: "lacounty_assessor",
    lookupAt: new Date().toISOString(),
  };

  const maxFootprint = computeMaxAduFootprint(draftPlan, setbacks, 850);
  let aduPlacement: { centerXFt: number; centerYFt: number };
  let finalWidth = aduWidth;
  let finalDepth = aduDepth;

  if (maxFootprint) {
    finalWidth = Math.min(aduWidth, maxFootprint.widthFt);
    finalDepth = Math.min(aduDepth, maxFootprint.depthFt);
    aduPlacement = constrainAduToMaxFootprint(
      {
        centerXFt: maxFootprint.centerXFt,
        centerYFt: maxFootprint.centerYFt,
        widthFt: finalWidth,
        depthFt: finalDepth,
      },
      maxFootprint
    );
  } else {
    aduPlacement = suggestAduPlacement(draftPlan, setbacks, {
      widthFt: aduWidth,
      depthFt: aduDepth,
    });
  }

  structures.push({
    id: uuidv4(),
    kind: "adu",
    centerXFt: aduPlacement.centerXFt,
    centerYFt: aduPlacement.centerYFt,
    widthFt: finalWidth,
    depthFt: finalDepth,
    rotationDeg: 0,
  });

  return {
    sitePlan: {
      ...draftPlan,
      structures,
      lookupMessage: usedGisFootprints
        ? "Building footprints from LA County LARIAC (2023)."
        : "Building locations estimated — LARIAC outlines unavailable.",
    },
    lariacBuildingCount: buildings.length,
    lariacTotalSqFt: buildings.reduce((sum, b) => sum + b.areaSqFt, 0),
  };
}

function propertyFromParcel(
  parcel: LacountyParcelFeature,
  address: string
): Partial<PropertyData> {
  const lotSqFt = parcel.properties["Shape.STArea()"];
  const primarySqFt = parseSqFt(parcel.properties.SQFTmain1);
  const city = (parcel.properties.TaxRateCity ?? "").toUpperCase();

  return {
    address: parcel.properties.SitusFullAddress || address,
    apn: parcel.properties.APN ?? parcel.properties.AIN,
    ain: parcel.properties.AIN,
    lotSqFt: lotSqFt ? Math.round(lotSqFt) : undefined,
    primarySqFt: primarySqFt ? Math.round(primarySqFt) : undefined,
    hasPrimaryDwelling: !!primarySqFt && primarySqFt > 0,
    hasGarage: false,
    gisVerified: true,
    overlays: {
      mountainFireZone: false,
      r1hHillside: false,
      nearPublicTransitHalfMile: false,
      permitParkingDistrict: false,
      nearHighQualityTransit: false,
      historicDistrict: false,
      steepSlopeDetected: false,
      streetTreesNearby: false,
      treeCanopyOnParcel: false,
      unpermittedStructureRisk: false,
    },
  };
}

export async function lookupBurbankParcel(
  address: string,
  options?: { ain?: string; zone?: BurbankZone }
): Promise<ParcelLookupResult> {
  if (!address.trim() && !options?.ain) {
    return { success: false, message: "Enter a site address or APN/AIN." };
  }

  try {
    let parcel: LacountyParcelFeature | null = null;
    let geocode: LatLng | null = null;

    if (options?.ain) {
      parcel = await fetchParcelByAin(options.ain);
      if (parcel?.properties.CENTER_LAT && parcel.properties.CENTER_LON) {
        geocode = {
          lat: parseFloat(parcel.properties.CENTER_LAT),
          lng: parseFloat(parcel.properties.CENTER_LON),
        };
      }
    }

    if (!parcel) {
      geocode = await geocodeAddress(address);
      if (!geocode) {
        return {
          success: false,
          message:
            "Could not geocode address. Check spelling or enter APN for lookup.",
        };
      }

      const nearby = await queryParcelsNearPoint(geocode);
      parcel = pickClosestParcel(nearby, geocode);
    }

    if (!parcel) {
      return {
        success: false,
        message: "No LA County parcel found at this location.",
      };
    }

    const city = (parcel.properties.TaxRateCity ?? "").toUpperCase();
    if (city && city !== "BURBANK") {
      return {
        success: false,
        message: `Parcel is in ${city}, not Burbank. This tool is scoped to Burbank only.`,
      };
    }

    if (!geocode) {
      geocode = {
        lat: parseFloat(parcel.properties.CENTER_LAT ?? "34.18"),
        lng: parseFloat(parcel.properties.CENTER_LON ?? "-118.31"),
      };
    }

    const { sitePlan, lariacBuildingCount, lariacTotalSqFt } =
      await buildSitePlanFromParcel(parcel, geocode);
    const propertyPatch = propertyFromParcel(parcel, address);

    const zoning = await lookupBurbankZoning({
      apnOrAin: parcel.properties.AIN ?? parcel.properties.APN ?? options?.ain,
      point: geocode,
    });

    if (zoning) {
      propertyPatch.zone = zoning.zone;
      if (zoning.zone === "R-1-H") {
        propertyPatch.overlays = {
          ...propertyPatch.overlays!,
          r1hHillside: true,
        };
      }
    } else if (options?.zone) {
      propertyPatch.zone = options.zone;
    }

    const dims =
      sitePlan.origin && sitePlan.axisBearingDeg !== undefined
        ? estimateLotDimensions(
            parcel.geometry,
            sitePlan.origin,
            sitePlan.axisBearingDeg
          )
        : null;

    if (dims) {
      propertyPatch.lotWidthFt = Math.round(dims.widthFt);
      propertyPatch.lotDepthFt = Math.round(dims.depthFt);
    }

    const overlayLookup = await lookupBurbankOverlays(
      geocode,
      propertyPatch.zone ?? "R-1",
      {
        parcel: parcel.geometry,
        lotWidthFt: propertyPatch.lotWidthFt,
        lotDepthFt: propertyPatch.lotDepthFt,
        address: propertyPatch.address ?? address,
        apn: propertyPatch.apn ?? propertyPatch.ain,
        buildings: {
          primarySqFt: propertyPatch.primarySqFt,
          lariacBuildingCount,
          lariacTotalSqFt,
        },
      }
    );
    propertyPatch.overlays = {
      ...propertyPatch.overlays!,
      ...overlayLookup.overlays,
    };

    const syncedProperty = syncPropertyFromSitePlan(
      { ...propertyPatch } as PropertyData,
      sitePlan
    );
    Object.assign(propertyPatch, syncedProperty);

    const apnLabel = parcel.properties.APN ?? parcel.properties.AIN;
    let message = `Parcel ${apnLabel} loaded from LA County Assessor.`;
    if (overlayLookup.messages.length > 0) {
      message += ` ${overlayLookup.messages.join(" ")}`;
    }
    if (zoning) {
      const yearSuffix = zoning.year ? ` (${zoning.year})` : "";
      if (zoning.zone === "OTHER") {
        message += ` GIS zoning: ${zoning.rawZone}${yearSuffix} — mapped to Other; confirm with Planning.`;
      } else {
        message += ` Zoning: ${zoning.rawZone}${yearSuffix} (SCAG).`;
      }
    } else {
      message +=
        " Zoning could not be resolved automatically — confirm district manually.";
    }

    return {
      success: true,
      message,
      propertyPatch,
      sitePlanPatch: sitePlan,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "GIS lookup failed";
    return { success: false, message: msg };
  }
}

export { createDefaultSitePlan } from "../geometry/site-plan";
