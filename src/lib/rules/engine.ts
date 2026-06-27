import type {
  AduType,
  BurbankZone,
  FeasibilityProject,
  FindingStatus,
  PermitStep,
  RuleFinding,
} from "../types";

const ADU_ZONES: BurbankZone[] = [
  "R-1",
  "R-1-H",
  "R2",
  "R3",
  "R4",
  "MDR-3",
  "MDR-4",
];

const JADU_ZONES: BurbankZone[] = ["R-1", "R-1-H"];

const ADU_HANDOUT =
  "https://www.burbankca.gov/documents/d/community-development/adu-handout-updated-7-11-2024";

function finding(
  partial: Omit<RuleFinding, "confidence"> & { confidence?: RuleFinding["confidence"] }
): RuleFinding {
  return { confidence: "verified", ...partial };
}

function maxAduSqFt(bedrooms: number, extraParking: number): number {
  const base = bedrooms >= 2 ? 1000 : 850;
  const bonus = Math.min(extraParking * 120, 120);
  return base + bonus;
}

function parkingRequired(project: FeasibilityProject): boolean {
  const { property, intent } = project;
  if (intent.aduTypes.includes("jadu")) return false;
  if (intent.aduTypes.every((t) => t === "jadu")) return false;

  const exempt =
    property.overlays.nearPublicTransitHalfMile ||
    property.overlays.permitParkingDistrict ||
    property.overlays.historicDistrict ||
    intent.isConversion ||
    intent.aduTypes.includes("garage_conversion");

  return !exempt;
}

function evaluateEligibility(project: FeasibilityProject): RuleFinding[] {
  const { property, intent } = project;
  const findings: RuleFinding[] = [];
  const zone = property.zone;

  const aduAllowed = ADU_ZONES.includes(zone) || zone === "OTHER";
  findings.push(
    finding({
      id: "eligibility.zone",
      category: "Eligibility",
      status: aduAllowed ? "pass" : "fail",
      summary: aduAllowed
        ? `ADUs permitted in ${zone} zone`
        : `Zone ${zone} requires verification — ADU may not be permitted`,
      detail:
        "ADUs and JADUs are permitted in R-1, R-1-H, R2, R3, R4, MDR-3, and MDR-4 per BMC § 10-1-620.3(B)(1).",
      citation: {
        citation: "BMC § 10-1-620.3(B)(1)",
        sourceUrl: ADU_HANDOUT,
        effectiveDate: "2024-07-11",
      },
      blocking: !aduAllowed,
    })
  );

  if (!property.hasPrimaryDwelling) {
    findings.push(
      finding({
        id: "eligibility.primary",
        category: "Eligibility",
        status: "warning",
        summary: "No existing primary dwelling — primary must be approved before ADU",
        citation: {
          citation: "BMC § 10-1-620.3(B)(2)",
          sourceUrl: ADU_HANDOUT,
        },
        blocking: false,
      })
    );
  }

  if (
    property.overlays.mountainFireZone ||
    property.zone === "R-1-H"
  ) {
    findings.push(
      finding({
        id: "eligibility.count_limit",
        category: "Eligibility",
        status: "warning",
        summary:
          "Mountain Fire Zone / R-1-H: only one ADU or one JADU allowed (not both)",
        citation: {
          citation: "ADU Handout — Mountain Fire Zone / R-1-H",
          sourceUrl: ADU_HANDOUT,
        },
        blocking: false,
        computed: {
          mountainFireZone: property.overlays.mountainFireZone,
          r1h: property.zone === "R-1-H",
        },
      })
    );
  }

  if (intent.aduTypes.includes("jadu")) {
    const jaduOk = JADU_ZONES.includes(zone);
    findings.push(
      finding({
        id: "eligibility.jadu_zone",
        category: "Eligibility",
        status: jaduOk ? "pass" : "fail",
        summary: jaduOk
          ? "JADU allowed in R-1 / R-1-H"
          : "JADU only permitted within R-1 or R-1-H",
        citation: {
          citation: "ADU Handout — Junior ADU",
          sourceUrl: ADU_HANDOUT,
        },
        blocking: !jaduOk,
      })
    );
  }

  findings.push(
    finding({
      id: "eligibility.review_type",
      category: "Eligibility",
      status: "info",
      summary: "Ministerial review — 60-day clock when application deemed complete",
      citation: {
        citation: "BMC § 10-1-620.3(A)",
        sourceUrl: ADU_HANDOUT,
      },
      blocking: false,
    })
  );

  return findings;
}

function evaluateSize(project: FeasibilityProject): RuleFinding[] {
  const { intent, envelope } = project;
  const findings: RuleFinding[] = [];

  if (intent.aduTypes.length === 0) return findings;

  if (intent.aduTypes.includes("jadu")) {
    findings.push(
      finding({
        id: "size.jadu_max",
        category: "Size",
        status: "info",
        summary: "JADU maximum 500 sq ft within existing single-family envelope",
        citation: {
          citation: "ADU Handout — Junior ADU",
          sourceUrl: ADU_HANDOUT,
        },
        computed: { maxSqFt: 500 },
        blocking: false,
      })
    );
  }

  const nonJadu = intent.aduTypes.filter((t) => t !== "jadu");
  if (nonJadu.length > 0) {
    const maxSqFt = maxAduSqFt(intent.bedrooms, intent.extraParkingSpaces ?? 0);
    const proposed = envelope.proposedSqFt ?? intent.targetSqFt;
    let status: FindingStatus = "info";
    if (proposed !== undefined) {
      status = proposed <= maxSqFt ? "pass" : "fail";
    }

    findings.push(
      finding({
        id: "size.adu_max",
        category: "Size",
        status,
        summary: `Max ADU size: ${maxSqFt} sq ft (${intent.bedrooms >= 2 ? "2+ BR" : "studio/1BR"}${(intent.extraParkingSpaces ?? 0) > 0 ? " + parking bonus" : ""})`,
        detail:
          "850 sf for studio/1BR; 1,000 sf for 2+ BR. Up to 120 sf bonus with deed-restricted extra parking beyond minimum.",
        citation: {
          citation: "BMC § 10-1-620.3(F)(2)",
          sourceUrl: ADU_HANDOUT,
        },
        computed: { maxSqFt, proposedSqFt: proposed ?? "not_set" },
        blocking: status === "fail",
      })
    );

    findings.push(
      finding({
        id: "size.far_exempt",
        category: "Size",
        status: "pass",
        summary: "ADUs exempt from FAR, lot coverage, open space, and minimum lot size",
        citation: {
          citation: "BMC § 10-1-620.3(F)(1)",
          sourceUrl: ADU_HANDOUT,
        },
        blocking: false,
      })
    );
  }

  return findings;
}

function evaluateSetbacks(project: FeasibilityProject): RuleFinding[] {
  const { intent, envelope } = project;
  const findings: RuleFinding[] = [];

  if (intent.aduTypes.length === 0) return findings;
  if (intent.aduTypes.every((t) => t === "jadu")) return findings;

  if (intent.isConversion && intent.sameFootprintConversion) {
    findings.push(
      finding({
        id: "setback.conversion",
        category: "Setbacks",
        status: "pass",
        summary: "Conversion in same footprint — no new setback required",
        citation: {
          citation: "BMC § 10-1-620.3(H)(6)",
          sourceUrl: ADU_HANDOUT,
        },
        blocking: false,
      })
    );
    return findings;
  }

  const minSide = 4;
  const minRear = 4;

  findings.push(
    finding({
      id: "setback.side_rear",
      category: "Setbacks",
      status: "info",
      summary: `Minimum ${minSide}' side and ${minRear}' rear setbacks for new attached/detached ADUs`,
      citation: {
        citation: "BMC § 10-1-620.3(H)(1)",
        sourceUrl: ADU_HANDOUT,
      },
      computed: { minSideFt: minSide, minRearFt: minRear },
      blocking: false,
    })
  );

  if (envelope.sideSetbackFt !== undefined) {
    findings.push(
      finding({
        id: "setback.side_check",
        category: "Setbacks",
        status: envelope.sideSetbackFt >= minSide ? "pass" : "fail",
        summary: `Proposed side setback: ${envelope.sideSetbackFt}' (min ${minSide}')`,
        citation: {
          citation: "BMC § 10-1-620.3(H)(1)",
          sourceUrl: ADU_HANDOUT,
        },
        blocking: envelope.sideSetbackFt < minSide,
      })
    );
  }

  if (envelope.rearSetbackFt !== undefined) {
    findings.push(
      finding({
        id: "setback.rear_check",
        category: "Setbacks",
        status: envelope.rearSetbackFt >= minRear ? "pass" : "fail",
        summary: `Proposed rear setback: ${envelope.rearSetbackFt}' (min ${minRear}')`,
        citation: {
          citation: "BMC § 10-1-620.3(H)(1)",
          sourceUrl: ADU_HANDOUT,
        },
        blocking: envelope.rearSetbackFt < minRear,
      })
    );
  }

  findings.push(
    finding({
      id: "setback.separation",
      category: "Setbacks",
      status: "info",
      summary:
        "5' building-face separation and 4' eave-to-eave from adjacent structures (unless physically infeasible for 800 sf ADU elsewhere)",
      citation: {
        citation: "BMC § 10-1-620.3(H)(4)",
        sourceUrl: ADU_HANDOUT,
      },
      blocking: false,
    })
  );

  if (envelope.separationFromPrimaryFt !== undefined) {
    findings.push(
      finding({
        id: "setback.separation_check",
        category: "Setbacks",
        status: envelope.separationFromPrimaryFt >= 5 ? "pass" : "fail",
        summary: `Separation from primary: ${envelope.separationFromPrimaryFt}' (min 5' face-to-face)`,
        citation: {
          citation: "BMC § 10-1-620.3(H)(4)",
          sourceUrl: ADU_HANDOUT,
        },
        blocking: envelope.separationFromPrimaryFt < 5,
      })
    );
  }

  findings.push(
    finding({
      id: "setback.front",
      category: "Setbacks",
      status: "needs_verification",
      summary:
        "Front setback: ADU cannot be closer to front property line than prevailing front yard for zone",
      detail:
        "Exception: front-yard build allowed if City determines it is physically infeasible to build 800 sf ADU elsewhere with 2' side/rear setbacks.",
      citation: {
        citation: "BMC § 10-1-620.3(H)(2)",
        sourceUrl: ADU_HANDOUT,
      },
      confidence: "verified",
      blocking: false,
    })
  );

  return findings;
}

function evaluateMapEnvelope(project: FeasibilityProject): RuleFinding[] {
  const { envelope, sitePlan } = project;
  const findings: RuleFinding[] = [];

  if (!sitePlan.parcelGeoJson || envelope.mapViolations === undefined) {
    return findings;
  }

  findings.push(
    finding({
      id: "map.loaded",
      category: "Site Map",
      status: "info",
      summary: "Parcel geometry loaded — setbacks computed from site plan",
      citation: {
        citation: "LA County Assessor parcel + site plan analysis",
      },
      confidence: sitePlan.lookupSource === "lacounty_assessor" ? "verified" : "user_provided",
      blocking: false,
    })
  );

  if (envelope.mapSideSetbackFt !== undefined) {
    findings.push(
      finding({
        id: "map.side_setback",
        category: "Site Map",
        status: envelope.mapSideSetbackFt >= 4 ? "pass" : "fail",
        summary: `Map side setback: ${envelope.mapSideSetbackFt.toFixed(1)}' (min 4')`,
        citation: { citation: "BMC § 10-1-620.3(H)(1)", sourceUrl: ADU_HANDOUT },
        computed: { measuredFt: envelope.mapSideSetbackFt },
        confidence: "inferred",
        blocking: envelope.mapSideSetbackFt < 4,
      })
    );
  }

  if (envelope.mapRearSetbackFt !== undefined) {
    findings.push(
      finding({
        id: "map.rear_setback",
        category: "Site Map",
        status: envelope.mapRearSetbackFt >= 4 ? "pass" : "fail",
        summary: `Map rear setback: ${envelope.mapRearSetbackFt.toFixed(1)}' (min 4')`,
        citation: { citation: "BMC § 10-1-620.3(H)(1)", sourceUrl: ADU_HANDOUT },
        computed: { measuredFt: envelope.mapRearSetbackFt },
        confidence: "inferred",
        blocking: envelope.mapRearSetbackFt < 4,
      })
    );
  }

  if (envelope.mapSeparationFt !== undefined && envelope.mapSeparationFt > 0) {
    findings.push(
      finding({
        id: "map.separation",
        category: "Site Map",
        status: envelope.mapSeparationFt >= 5 ? "pass" : "fail",
        summary: `Map separation from primary: ${envelope.mapSeparationFt.toFixed(1)}' (min 5')`,
        citation: { citation: "BMC § 10-1-620.3(H)(4)", sourceUrl: ADU_HANDOUT },
        computed: { measuredFt: envelope.mapSeparationFt },
        confidence: "inferred",
        blocking: envelope.mapSeparationFt < 5,
      })
    );
  }

  for (const v of envelope.mapViolations ?? []) {
    if (
      v.startsWith("Side setback") ||
      v.startsWith("Rear setback") ||
      v.startsWith("Primary separation") ||
      v.startsWith("Front setback")
    ) {
      continue;
    }
    findings.push(
      finding({
        id: `map.violation.${v.slice(0, 20)}`,
        category: "Site Map",
        status: "fail",
        summary: v,
        citation: { citation: "Site plan geometry analysis" },
        confidence: "inferred",
        blocking: true,
      })
    );
  }

  return findings;
}

function evaluateHeight(project: FeasibilityProject): RuleFinding[] {
  const { intent, property, envelope } = project;
  const findings: RuleFinding[] = [];

  const types = intent.aduTypes.filter((t) => t !== "jadu");
  if (types.length === 0) return findings;

  for (const type of types) {
    let maxPlate = 17;
    let maxRoof = 17;
    let label = "";

    if (type === "attached") {
      maxPlate = 20;
      maxRoof = 30;
      label = "Attached ADU";
    } else if (type === "adu_on_garage") {
      maxPlate = 20;
      maxRoof = 23;
      label = "ADU on garage/structure";
    } else if (type === "detached") {
      if (property.overlays.nearHighQualityTransit) {
        maxPlate = 18;
        maxRoof = 18;
        label = "Detached ADU (near high-quality transit)";
      } else {
        maxPlate = 12;
        maxRoof = 17;
        label = "Detached ADU (one story)";
      }
    } else if (type === "garage_conversion") {
      label = "Garage conversion";
      maxPlate = 20;
      maxRoof = 23;
    }

    let status: FindingStatus = "info";
    if (envelope.proposedHeightFt !== undefined) {
      status = envelope.proposedHeightFt <= maxRoof ? "pass" : "fail";
    }

    findings.push(
      finding({
        id: `height.${type}`,
        category: "Height",
        status,
        summary: `${label}: max ${maxPlate}' to plate, ${maxRoof}' to roof/features`,
        citation: {
          citation: "BMC § 10-1-620.3(G); ADU Handout",
          sourceUrl: ADU_HANDOUT,
        },
        computed: {
          maxPlateFt: maxPlate,
          maxRoofFt: maxRoof,
          proposedFt: envelope.proposedHeightFt ?? "not_set",
        },
        blocking: status === "fail",
      })
    );
  }

  return findings;
}

function evaluateParking(project: FeasibilityProject): RuleFinding[] {
  const { intent } = project;
  const findings: RuleFinding[] = [];

  if (intent.aduTypes.length === 0) return findings;

  if (intent.aduTypes.includes("jadu") && intent.aduTypes.length === 1) {
    findings.push(
      finding({
        id: "parking.jadu",
        category: "Parking",
        status: "pass",
        summary: "No parking required for JADU",
        citation: {
          citation: "ADU Handout — Junior ADU",
          sourceUrl: ADU_HANDOUT,
        },
        blocking: false,
      })
    );
    return findings;
  }

  const required = parkingRequired(project);
  findings.push(
    finding({
      id: "parking.requirement",
      category: "Parking",
      status: required ? "warning" : "pass",
      summary: required
        ? "1 parking space required (per ADU or per bedroom, whichever is less)"
        : "Parking exempt — transit half-mile, permit district, conversion, or historic district",
      citation: {
        citation: "BMC § 10-1-620.3(C–E); Gov. Code § 65852.2",
        sourceUrl: ADU_HANDOUT,
      },
      blocking: false,
    })
  );

  if (intent.isConversion || intent.aduTypes.includes("garage_conversion")) {
    findings.push(
      finding({
        id: "parking.conversion",
        category: "Parking",
        status: "pass",
        summary: "Garage demolition/conversion — replacement parking not required for primary",
        citation: {
          citation: "BMC § 10-1-620.3(C)(2)",
          sourceUrl: ADU_HANDOUT,
        },
        blocking: false,
      })
    );
  }

  return findings;
}

function evaluateConstraints(project: FeasibilityProject): RuleFinding[] {
  const { constraints, property } = project;
  const findings: RuleFinding[] = [];

  if (constraints.unpermittedStructures) {
    findings.push(
      finding({
        id: "constraints.unpermitted",
        category: "Site",
        status: "warning",
        summary: "Unpermitted structures on lot — resolve before or during permit process",
        citation: {
          citation: "Planning pre-clearance review",
          sourceUrl:
            "https://www.burbankca.gov/web/community-development/plan-check-review",
        },
        confidence: "user_provided",
        blocking: false,
      })
    );
  }

  if (constraints.heritageTreesInWorkArea || constraints.newDrivewayOrCurbCut) {
    findings.push(
      finding({
        id: "constraints.trees",
        category: "Site",
        status: "needs_verification",
        summary: "Tree protection (BMC Title 7 Ch. 4) may apply to driveway/curb cut work",
        citation: {
          citation: "BMC § 10-1-620.3(C)(5); Title 7 Ch. 4",
          sourceUrl: ADU_HANDOUT,
        },
        blocking: false,
      })
    );
  }

  if (property.overlays.mountainFireZone || property.zone === "R-1-H") {
    findings.push(
      finding({
        id: "constraints.fire_hillside",
        category: "Site",
        status: "warning",
        summary: "Mountain Fire Zone / R-1-H — additional fire and hillside standards apply",
        citation: {
          citation: "ADU Handout; R-1-H overlay",
          sourceUrl: ADU_HANDOUT,
        },
        blocking: false,
      })
    );
  }

  if (constraints.hillsideSlopeConcern) {
    findings.push(
      finding({
        id: "constraints.slope",
        category: "Site",
        status: "needs_verification",
        summary: "Hillside/slope conditions — geotechnical review may be required",
        citation: {
          citation: "Site-specific determination",
        },
        confidence: "user_provided",
        blocking: false,
      })
    );
  }

  return findings;
}

function evaluateUtilities(project: FeasibilityProject): RuleFinding[] {
  const { utilities } = project;
  const findings: RuleFinding[] = [];

  findings.push(
    finding({
      id: "utilities.bwp_electric",
      category: "Utilities",
      status: "needs_verification",
      summary: "BWP Electric ADU plan check requirements — submit load calc and panel info",
      citation: {
        citation: "BWP Electric ADU Requirements",
        sourceUrl:
          "https://www.burbankca.gov/web/community-development/building-permits",
      },
      blocking: false,
    })
  );

  findings.push(
    finding({
      id: "utilities.bwp_water",
      category: "Utilities",
      status: "needs_verification",
      summary: "BWP Water fixture count form required for ADU permits",
      citation: {
        citation: "BWP Water ADU Requirements",
        sourceUrl:
          "https://www.burbankca.gov/web/community-development/building-permits",
      },
      blocking: false,
    })
  );

  if (utilities.panelUpgradeLikely) {
    findings.push(
      finding({
        id: "utilities.panel",
        category: "Utilities",
        status: "warning",
        summary: "Panel upgrade likely — budget for service upgrade and BWP review timeline",
        confidence: "user_provided",
        citation: {
          citation: "BWP Electric ADU Requirements",
        },
        blocking: false,
      })
    );
  }

  if (utilities.sewerLateralUnknown) {
    findings.push(
      finding({
        id: "utilities.sewer",
        category: "Utilities",
        status: "needs_verification",
        summary: "Sewer lateral capacity/condition — Public Works review required",
        citation: {
          citation: "Public Works Department",
          sourceUrl:
            "https://www.burbankca.gov/web/community-development/plan-check-review",
        },
        blocking: false,
      })
    );
  }

  if (utilities.schoolFeesApplicable) {
    findings.push(
      finding({
        id: "utilities.school_fees",
        category: "Utilities",
        status: "info",
        summary: "Contact Burbank Unified School District Facilities for school impact fees",
        citation: {
          citation: "BUSD Facilities",
        },
        blocking: false,
      })
    );
  }

  return findings;
}

export function evaluateProject(project: FeasibilityProject): RuleFinding[] {
  return [
    ...evaluateEligibility(project),
    ...evaluateSize(project),
    ...evaluateSetbacks(project),
    ...evaluateMapEnvelope(project),
    ...evaluateHeight(project),
    ...evaluateParking(project),
    ...evaluateConstraints(project),
    ...evaluateUtilities(project),
  ];
}

export function computeVerdict(
  findings: RuleFinding[]
): FeasibilityProject["verdict"] {
  if (findings.some((f) => f.blocking && f.status === "fail")) {
    return "not_feasible";
  }
  if (
    findings.some(
      (f) =>
        f.status === "warning" ||
        f.status === "needs_verification" ||
        (f.blocking && f.status !== "pass")
    )
  ) {
    return "feasible_with_conditions";
  }
  return "feasible";
}

export function getBurbankPermitPathway(
  useBpap: boolean
): PermitStep[] {
  const base: PermitStep[] = [
    {
      order: 1,
      department: "Planning",
      title: "Pre-application / zoning preclearance",
      description:
        "Confirm site address, ADU size, zone, and overlays. Planning screens plans within 48–72 hours for zoning pre-clearance.",
      timeline: "48–72 hours (screening)",
      contact: "planning@burbankca.gov",
    },
    {
      order: 2,
      department: "Building & Safety",
      title: "ProjectDox submission",
      description:
        "Email eplancheck@burbankca.gov for portal access. Submit building permit application, plans, and ADU-specific forms.",
      timeline: "3–7 days for portal access",
      forms: [
        "Building Permit Application",
        "BWP Electric ADU Requirements",
        "BWP Water Fixture Count Form",
      ],
      contact: "eplancheck@burbankca.gov",
    },
    {
      order: 3,
      department: "Planning",
      title: "Zoning pre-clearance (plan check)",
      description:
        "Planning verifies compliance with BMC ADU standards during first plan check cycle.",
      timeline: "Part of first review",
      contact: "planning@burbankca.gov",
    },
    {
      order: 4,
      department: "Building & Safety",
      title: "Building plan check",
      description:
        "Life safety, structural, and Title 24 energy compliance review.",
      timeline: "Up to ~8 weeks first review; 2–4 weeks recheck",
      contact: "building@burbankca.gov",
    },
    {
      order: 5,
      department: "Public Works",
      title: "Public Works review",
      description: "Sewer, drainage, right-of-way, and site development.",
      contact: "Public Works (assigned in ProjectDox)",
    },
    {
      order: 6,
      department: "BWP Electric",
      title: "Electric utility review",
      description: "Load calculations, panel/meter requirements for ADU.",
      forms: ["BWP Electric ADU Plan Check Requirements"],
    },
    {
      order: 7,
      department: "BWP Water",
      title: "Water utility review",
      description: "Fixture count and water service for ADU.",
      forms: ["BWP Water Fixture Count Form"],
    },
    {
      order: 8,
      department: "Fire",
      title: "Fire Department review",
      description: "Fire access, WUI standards if applicable, egress.",
      contact: "Fire (assigned in ProjectDox)",
    },
    {
      order: 9,
      department: "BUSD",
      title: "School impact fees",
      description:
        "Contact Burbank Unified School District Facilities for applicable fees.",
    },
    {
      order: 10,
      department: "Building & Safety",
      title: "Permit issuance & inspections",
      description:
        "Stamped plans issued after all departments approve. Schedule construction inspections through final.",
    },
  ];

  if (useBpap) {
    return [
      {
        order: 0,
        department: "Planning + BPAP",
        title: "Burbank Pre-Approved ADU Program (BPAP)",
        description:
          "Use pre-approved plan set. Connect with Planning for site-specific zoning preclearance before BPAP submittal.",
        timeline: "Faster plan check for standard designs",
        sourceUrl:
          "https://www.burbankca.gov/web/community-development/pre-approved-adu",
        forms: [
          "BPAP Permit Requirements",
          "BPAP Permit Submittal Checklist",
          "BPAP G001 Sheet",
        ],
        contact: "planning@burbankca.gov",
      },
      ...base,
    ];
  }

  return base;
}

export function recommendAduTypes(project: FeasibilityProject): AduType[] {
  const recs: AduType[] = [];
  const { property, intent } = project;

  if (property.hasGarage) {
    recs.push("garage_conversion");
  }
  if (ADU_ZONES.includes(property.zone)) {
    recs.push("detached");
  }
  if (JADU_ZONES.includes(property.zone) && property.hasPrimaryDwelling) {
    recs.push("jadu");
  }
  if (property.hasGarage) {
    recs.push("adu_on_garage");
  }
  if (intent.bedrooms >= 2) {
    recs.push("attached");
  }

  return [...new Set(recs)];
}
