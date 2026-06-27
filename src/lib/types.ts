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
  | "eligibility"
  | "adu_type"
  | "envelope"
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
}

export interface SitePlanData {
  parcelGeoJson?: ParcelPolygon;
  geocode?: LatLng;
  origin?: LatLng;
  /** Degrees clockwise from north for local +X (along frontage) */
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
    nearHighQualityTransit: boolean;
    historicDistrict: boolean;
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
  mapSideSetbackFt?: number;
  mapRearSetbackFt?: number;
  mapSeparationFt?: number;
  mapViolations?: string[];
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
