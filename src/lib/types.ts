export type JurisdictionId = "burbank-ca";

export type BurbankZone =
  | "R-1"
  | "R-1-H"
  | "R2"
  | "R3"
  | "R4"
  | "MDR-3"
  | "MDR-4"
  | "OTHER";

export type AduType =
  | "detached"
  | "attached"
  | "garage_conversion"
  | "adu_on_garage"
  | "jadu";

export type WizardStep =
  | "property"
  | "eligibility_envelope"
  | "adu_type"
  | "constraints"
  | "utilities"
  | "permits"
  | "report";

export type FindingStatus =
  | "pass"
  | "fail"
  | "warning"
  | "needs_verification"
  | "info";

export type Confidence = "verified" | "inferred" | "user_provided";

export interface CodeReference {
  citation: string;
  sourceUrl?: string;
  effectiveDate?: string;
}

export interface RuleFinding {
  id: string;
  category: string;
  status: FindingStatus;
  summary: string;
  detail?: string;
  citation: CodeReference;
  computed?: Record<string, string | number | boolean>;
  confidence: Confidence;
  blocking: boolean;
}

export interface LatLng {
  lat: number;
  lng: number;
}

export interface ParcelPolygon {
  type: "Polygon";
  coordinates: number[][][];
}

export type StructureKind = "primary" | "garage" | "adu";

export interface RectFootprint {
  id: string;
  kind: StructureKind;
  /** Center X in local feet (along frontage) */
  centerXFt: number;
  /** Center Y in local feet (depth into lot, 0 at front line) */
  centerYFt: number;
  widthFt: number;
  depthFt: number;
  rotationDeg: number;
  /** LARIAC building outline when sourced from GIS (preferred for map render) */
  footprintGeoJson?: ParcelPolygon;
}

export interface SitePlanData {
  parcelGeoJson?: ParcelPolygon;
  geocode?: LatLng;
  origin?: LatLng;
  /** Degrees clockwise from north for local +Y (depth into lot; +X is frontage) */
  axisBearingDeg?: number;
  frontEdgeIndex?: number;
  structures: RectFootprint[];
  lookupSource?: "lacounty_assessor" | "manual";
  lookupAt?: string;
  lookupMessage?: string;
}

export interface ParcelLookupResult {
  success: boolean;
  message: string;
  propertyPatch?: Partial<PropertyData>;
  sitePlanPatch?: Partial<SitePlanData>;
}

export interface PropertyData {
  address: string;
  apn?: string;
  ain?: string;
  zone: BurbankZone;
  lotSqFt?: number;
  lotWidthFt?: number;
  lotDepthFt?: number;
  frontSetbackFt?: number;
  hasPrimaryDwelling: boolean;
  primarySqFt?: number;
  hasGarage: boolean;
  garageInFrontYard?: boolean;
  gisVerified?: boolean;
  overlays: {
    mountainFireZone: boolean;
    r1hHillside: boolean;
    nearPublicTransitHalfMile: boolean;
    permitParkingDistrict: boolean;
    /** Zone letter (A–H) when matched from City permit parking map */
    permitParkingZone?: string;
    nearHighQualityTransit: boolean;
    historicDistrict: boolean;
    historicResourceName?: string;
    /** LA County LARIAC contours — estimated max slope ≥25% on parcel */
    steepSlopeDetected: boolean;
    /** Estimated max slope (percent rise) from contour elevation range on lot */
    estimatedMaxSlopePct?: number;
    /** Street or parkway trees within buffer of parcel (LA County inventory) */
    streetTreesNearby: boolean;
    streetTreeCount?: number;
    largeStreetTreesNearby?: number;
    /** LARIAC 2023 tree canopy raster sampled on parcel */
    treeCanopyOnParcel: boolean;
    /** LARIAC vs Assessor footprint discrepancy — screening only */
    unpermittedStructureRisk: boolean;
    unpermittedStructureNote?: string;
  };
}

export interface ProjectIntent {
  aduTypes: AduType[];
  bedrooms: 0 | 1 | 2 | 3;
  targetSqFt?: number;
  extraParkingSpaces?: number;
  isConversion: boolean;
  sameFootprintConversion?: boolean;
}

export interface EnvelopeData {
  proposedSqFt?: number;
  proposedHeightFt?: number;
  sideSetbackFt?: number;
  rearSetbackFt?: number;
  separationFromPrimaryFt?: number;
  separationFromGarageFt?: number;
  minStructureSeparationFt?: number;
  mapSideSetbackFt?: number;
  mapRearSetbackFt?: number;
  mapSeparationFt?: number;
  mapSeparationFromGarageFt?: number;
  mapMinStructureSeparationFt?: number;
  remainingBuildableSqFt?: number;
  buildableConsumedPct?: number;
  minAccessPassageFt?: number;
  mapViolations?: string[];
  mapDesignWarnings?: string[];
  floorAreaAnalysis?: AduFloorAreaAnalysis;
}

export interface AduHeightLimits {
  label: string;
  plateFt: number;
  roofFt: number;
}

export interface StoryPermitAnalysis {
  maxStories: 1 | 2;
  singleStoryOnly: boolean;
  note?: string;
}

export interface AduFloorAreaByType {
  aduType: AduType;
  label: string;
  height: AduHeightLimits;
  stories: StoryPermitAnalysis;
  codeMaxSqFt: number;
  maxSingleStoryTotalSqFt: number;
  singleStoryFootprintSqFt: number;
  maxTwoStoryTotalSqFt: number | null;
  twoStoryFootprintSqFt: number | null;
}

export interface AduFloorAreaAnalysis {
  codeMaxSqFt: number;
  minFloorToFloorFt: number;
  minHabitableCeilingFt: number;
  byType: AduFloorAreaByType[];
}

export interface SitePlanSyncOptions {
  frontSetbackFt?: number;
  setbacks?: { frontFt: number; sideFt: number; rearFt: number };
  maxSqFt?: number;
  floorAreaContext?: Pick<FeasibilityProject, "property" | "intent">;
}

export interface ConstraintsData {
  unpermittedStructures: boolean;
  heritageTreesInWorkArea: boolean;
  newDrivewayOrCurbCut: boolean;
  hillsideSlopeConcern: boolean;
}

export interface UtilitiesData {
  panelUpgradeLikely: boolean;
  sewerLateralUnknown: boolean;
  waterMeterUpgradeUnknown: boolean;
  schoolFeesApplicable: boolean;
}

export interface FeasibilityProject {
  id: string;
  jurisdictionId: JurisdictionId;
  createdAt: string;
  updatedAt: string;
  currentStep: WizardStep;
  property: PropertyData;
  intent: ProjectIntent;
  envelope: EnvelopeData;
  sitePlan: SitePlanData;
  constraints: ConstraintsData;
  utilities: UtilitiesData;
  findings: RuleFinding[];
  verdict?: "feasible" | "feasible_with_conditions" | "not_feasible";
}

export interface PermitStep {
  order: number;
  department: string;
  title: string;
  description: string;
  timeline?: string;
  forms?: string[];
  contact?: string;
  sourceUrl?: string;
}

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}
