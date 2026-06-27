"use client";

import { get, set, del, keys } from "idb-keyval";
import { v4 as uuidv4 } from "uuid";
import type {
  AssistantMessage,
  FeasibilityProject,
  PropertyData,
  ProjectIntent,
  EnvelopeData,
  SitePlanData,
  ConstraintsData,
  UtilitiesData,
  ParcelPolygon,
} from "./types";
import { createDefaultSitePlan } from "./geometry/site-plan";

const PROJECT_PREFIX = "project:";
const ASSISTANT_PREFIX = "assistant:";

function defaultProperty(): PropertyData {
  return {
    address: "",
    zone: "R-1",
    hasPrimaryDwelling: true,
    hasGarage: false,
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

function defaultIntent(): ProjectIntent {
  return {
    aduTypes: [],
    bedrooms: 1,
    extraParkingSpaces: 0,
    isConversion: false,
  };
}

function defaultEnvelope(): EnvelopeData {
  return {};
}

function defaultSitePlan(): SitePlanData {
  return createDefaultSitePlan();
}

function defaultConstraints(): ConstraintsData {
  return {
    unpermittedStructures: false,
    heritageTreesInWorkArea: false,
    newDrivewayOrCurbCut: false,
    hillsideSlopeConcern: false,
  };
}

function defaultUtilities(): UtilitiesData {
  return {
    panelUpgradeLikely: false,
    sewerLateralUnknown: true,
    waterMeterUpgradeUnknown: true,
    schoolFeesApplicable: true,
  };
}

export function createEmptyProject(): FeasibilityProject {
  const now = new Date().toISOString();
  return {
    id: uuidv4(),
    jurisdictionId: "burbank-ca",
    createdAt: now,
    updatedAt: now,
    currentStep: "property",
    property: defaultProperty(),
    intent: defaultIntent(),
    envelope: defaultEnvelope(),
    sitePlan: defaultSitePlan(),
    constraints: defaultConstraints(),
    utilities: defaultUtilities(),
    findings: [],
  };
}

export async function saveProject(project: FeasibilityProject): Promise<void> {
  const updated = { ...project, updatedAt: new Date().toISOString() };
  await set(`${PROJECT_PREFIX}${project.id}`, updated);
}

export async function loadProject(
  id: string
): Promise<FeasibilityProject | undefined> {
  const project = await get<FeasibilityProject>(`${PROJECT_PREFIX}${id}`);
  if (!project) return undefined;
  if (!project.sitePlan) {
    project.sitePlan = createDefaultSitePlan();
  }
  // Migrate legacy site plan shape if present in IndexedDB
  const sp = project.sitePlan as SitePlanData & {
    parcel?: ParcelPolygon;
  };
  if (!sp.parcelGeoJson && sp.parcel?.type === "Polygon") {
    sp.parcelGeoJson = sp.parcel;
  }
  return project;
}

export async function deleteProject(id: string): Promise<void> {
  await del(`${PROJECT_PREFIX}${id}`);
  await del(`${ASSISTANT_PREFIX}${id}`);
}

export async function listProjects(): Promise<FeasibilityProject[]> {
  const allKeys = await keys();
  const projectKeys = allKeys.filter(
    (k) => typeof k === "string" && k.startsWith(PROJECT_PREFIX)
  ) as string[];

  const projects = await Promise.all(
    projectKeys.map((k) => get<FeasibilityProject>(k))
  );

  return projects
    .filter((p): p is FeasibilityProject => !!p)
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
}

export async function saveAssistantMessages(
  projectId: string,
  messages: AssistantMessage[]
): Promise<void> {
  await set(`${ASSISTANT_PREFIX}${projectId}`, messages);
}

export async function loadAssistantMessages(
  projectId: string
): Promise<AssistantMessage[]> {
  return (await get<AssistantMessage[]>(`${ASSISTANT_PREFIX}${projectId}`)) ?? [];
}
