import type { AssistantMessage, FeasibilityProject, RuleFinding } from "../types";
import { getBurbankPermitPathway } from "../rules/engine";

const KNOWLEDGE: Record<string, string> = {
  setback:
    "Burbank requires 4' minimum side and rear setbacks for new attached/detached ADUs (BMC § 10-1-620.3(H)(1)). Conversions in the same footprint need no new setback. Building separation: 5' face-to-face, 4' eave-to-eave.",
  parking:
    "Parking is not required when within ½ mile of public transit, in a permit-parking district, for conversions, or in a historic district. Otherwise max 1 space per ADU or bedroom (whichever is less). JADUs require no parking.",
  size: "Studio/1BR ADU max 850 sf; 2+ BR max 1,000 sf. Up to 120 sf bonus with deed-restricted extra parking. ADUs are exempt from FAR and lot coverage.",
  height:
    "Detached: 12' plate / 17' roof (18' near high-quality transit). Attached: 20' plate / 30' roof. ADU on garage: 20' plate / 23' roof.",
  jadu: "JADU max 500 sf within existing R-1/R-1-H single-family envelope. Separate entrance and efficiency kitchen required. No parking.",
  permit:
    "Submit via ProjectDox after emailing eplancheck@burbankca.gov. Planning zoning pre-clearance in first 48–72 hours. Reviews: Planning, Building, Public Works, BWP Electric, BWP Water, Fire, BUSD fees.",
  timeline:
    "Ministerial 60-day review when complete. Building first review up to ~8 weeks; rechecks 2–4 weeks. ADU timelines vary.",
  zone: "ADUs allowed in R-1, R-1-H, R2, R3, R4, MDR-3, MDR-4. Mountain Fire Zone / R-1-H: one ADU OR one JADU only.",
};

function matchKnowledge(query: string): string | null {
  const q = query.toLowerCase();
  for (const [key, answer] of Object.entries(KNOWLEDGE)) {
    if (q.includes(key)) return answer;
  }
  if (q.includes("how long") || q.includes("timeline")) return KNOWLEDGE.timeline;
  if (q.includes("allowed") || q.includes("eligible")) return KNOWLEDGE.zone;
  return null;
}

function summarizeFindings(findings: RuleFinding[]): string {
  const blocking = findings.filter((f) => f.status === "fail");
  const warnings = findings.filter(
    (f) => f.status === "warning" || f.status === "needs_verification"
  );

  const parts: string[] = [];
  if (blocking.length > 0) {
    parts.push(
      `**Blocking issues (${blocking.length}):**\n` +
        blocking.map((f) => `• ${f.summary} (${f.citation.citation})`).join("\n")
    );
  }
  if (warnings.length > 0) {
    parts.push(
      `**Items to verify (${warnings.length}):**\n` +
        warnings
          .slice(0, 5)
          .map((f) => `• ${f.summary}`)
          .join("\n")
    );
  }
  if (parts.length === 0) {
    return "No blocking issues in current findings. Review envelope and utility items before submittal.";
  }
  return parts.join("\n\n");
}

export function generateAssistantReply(
  query: string,
  project: FeasibilityProject
): string {
  const q = query.toLowerCase().trim();

  if (q.includes("verdict") || q.includes("feasible")) {
    const v = project.verdict ?? "not yet computed";
    return `Current verdict: **${v.replace(/_/g, " ")}**.\n\n${summarizeFindings(project.findings)}`;
  }

  if (q.includes("finding") || q.includes("issue") || q.includes("block")) {
    return summarizeFindings(project.findings);
  }

  if (q.includes("permit") || q.includes("submittal") || q.includes("projectdox")) {
    const steps = getBurbankPermitPathway(false);
    return (
      KNOWLEDGE.permit +
      "\n\n**Permit sequence:**\n" +
      steps
        .slice(0, 6)
        .map((s) => `${s.order}. ${s.department}: ${s.title}`)
        .join("\n")
    );
  }

  if (q.includes("recommend") || q.includes("which adu") || q.includes("best type")) {
    const types = project.intent.aduTypes;
    if (types.length === 0) {
      return "No ADU type selected yet. For Burbank lots with an existing garage, **garage conversion** is often the fastest path. **Detached** maximizes rentable sf if setbacks allow. **JADU** works for small units within R-1/R-1-H primary envelope.";
    }
    return `Selected types: ${types.join(", ")}. ${project.property.hasGarage ? "Garage on site — conversion may avoid new foundations and parking replacement." : "No garage — detached or attached new construction likely."}`;
  }

  if (q.includes("map") || q.includes("setback") && project.sitePlan.parcelGeoJson) {
    const e = project.envelope;
    return (
      `**Site plan measurements:**\n` +
      `- Side setback: ${e.mapSideSetbackFt?.toFixed(1) ?? "—"} ft (min 4')\n` +
      `- Rear setback: ${e.mapRearSetbackFt?.toFixed(1) ?? "—"} ft (min 4')\n` +
      `- Primary separation: ${e.mapSeparationFt?.toFixed(1) ?? "—"} ft (min 5')\n\n` +
      (e.mapViolations?.length
        ? `Violations:\n${e.mapViolations.map((v) => `• ${v}`).join("\n")}`
        : "No geometry violations flagged.")
    );
  }

  const knowledge = matchKnowledge(q);
  if (knowledge) {
    return knowledge + "\n\n*Source: Burbank ADU Handout (7/11/2024) and BMC § 10-1-620.3. Verify with Planning for site-specific determinations.*";
  }

  return (
    "I can help with Burbank ADU **setbacks**, **size limits**, **height**, **parking**, **JADU rules**, **permit pathway**, and **current findings**.\n\n" +
    "Try: \"What are the setback requirements?\" or \"Summarize blocking issues\" or \"What's the permit process?\"\n\n" +
    `Project: ${project.property.address || "no address yet"}, zone ${project.property.zone}.`
  );
}

export function createAssistantMessage(
  role: "user" | "assistant",
  content: string
): AssistantMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    timestamp: new Date().toISOString(),
  };
}
