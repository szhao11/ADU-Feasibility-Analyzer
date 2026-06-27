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
} from "../geometry/site-plan";

function parseSqFt(value: string | number | undefined): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = typeof value === "number" ? value : parseFloat(value);
  return Number.isFinite(n) ? n : undefined;
}

function buildSitePlanFromParcel(
  parcel: LacountyParcelFeature,
  geocode: LatLng
): SitePlanData {
  const orientation = orientParcel(parcel.geometry, geocode);
  const lotSqFt = parcel.properties["Shape.STArea()"];
  const primarySqFt = parseSqFt(parcel.properties.SQFTmain1);
  const dims = estimateLotDimensions(
    parcel.geometry,
    orientation.origin,
    orientation.axisBearingDeg
  );

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

  const garageWidth = 22;
  const garageDepth = 20;
  structures.push({
    id: uuidv4(),
    kind: "garage",
    centerXFt: dims.widthFt * 0.72,
    centerYFt: garageDepth / 2 + 6,
    widthFt: garageWidth,
    depthFt: garageDepth,
    rotationDeg: 0,
  });

  const aduWidth = 20;
  const aduDepth = 24;
  structures.push({
    id: uuidv4(),
    kind: "adu",
    centerXFt: aduWidth / 2 + 6,
    centerYFt: dims.depthFt - aduDepth / 2 - 6,
    widthFt: aduWidth,
    depthFt: aduDepth,
    rotationDeg: 0,
  });

  return {
    parcelGeoJson: parcel.geometry,
    geocode,
    origin: orientation.origin,
    axisBearingDeg: orientation.axisBearingDeg,
    frontEdgeIndex: orientation.frontEdgeIndex,
    structures,
    lookupSource: "lacounty_assessor",
    lookupAt: new Date().toISOString(),
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
    hasGarage: true,
    gisVerified: true,
    overlays: {
      mountainFireZone: false,
      r1hHillside: false,
      nearPublicTransitHalfMile: false,
      permitParkingDistrict: false,
      nearHighQualityTransit: false,
      historicDistrict: false,
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

    const sitePlan = buildSitePlanFromParcel(parcel, geocode);
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

    const apnLabel = parcel.properties.APN ?? parcel.properties.AIN;
    let message = `Parcel ${apnLabel} loaded from LA County Assessor.`;
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
