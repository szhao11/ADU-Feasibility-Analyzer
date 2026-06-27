"use client";

import type { FeasibilityProject } from "@/lib/types";
import { VerdictBadge, StatusBadge } from "@/components/ui/StatusBadge";
import { Button, Card } from "@/components/ui/Form";
import { Download } from "lucide-react";

function generateReportMarkdown(project: FeasibilityProject): string {
  const lines: string[] = [
    `# ADU Feasibility Report`,
    ``,
    `**Jurisdiction:** City of Burbank`,
    `**Address:** ${project.property.address || "—"}`,
    `**APN:** ${project.property.apn || "—"}`,
    `**Zone:** ${project.property.zone}`,
    `**Generated:** ${new Date().toLocaleString()}`,
  `**Verdict:** ${(project.verdict ?? "pending").replace(/_/g, " ")}`,
    ``,
    `> This report is for builder screening only. Not a permit approval or zoning letter.`,
    ``,
    `## ADU Intent`,
    `- Types: ${project.intent.aduTypes.join(", ") || "none selected"}`,
    `- Bedrooms: ${project.intent.bedrooms}`,
    ``,
    `## Regulatory Findings`,
    ``,
  ];

  const grouped = project.findings.reduce<Record<string, typeof project.findings>>(
    (acc, f) => {
      (acc[f.category] ??= []).push(f);
      return acc;
    },
    {}
  );

  for (const [cat, items] of Object.entries(grouped)) {
    lines.push(`### ${cat}`);
    for (const f of items) {
      lines.push(`- **[${f.status.toUpperCase()}]** ${f.summary} (${f.citation.citation})`);
    }
    lines.push("");
  }

  lines.push(`## Open Items`);
  const open = project.findings.filter(
    (f) => f.status === "needs_verification" || f.status === "warning"
  );
  if (open.length === 0) {
    lines.push(`- None flagged`);
  } else {
    for (const f of open) {
      lines.push(`- ${f.summary}`);
    }
  }

  return lines.join("\n");
}

export function StepReport({ project }: { project: FeasibilityProject }) {
  function downloadReport() {
    const md = generateReportMarkdown(project);
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `adu-feasibility-${project.property.address.replace(/\s+/g, "-").toLowerCase() || project.id}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const blocking = project.findings.filter((f) => f.status === "fail");
  const verify = project.findings.filter(
    (f) => f.status === "needs_verification" || f.status === "warning"
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Feasibility report
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Decision-grade summary for internal builder use.
          </p>
        </div>
        <VerdictBadge verdict={project.verdict} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="text-center">
          <p className="text-2xl font-bold text-slate-900">
            {project.findings.length}
          </p>
          <p className="text-xs text-slate-500">Total findings</p>
        </Card>
        <Card className="text-center">
          <p className="text-2xl font-bold text-red-600">{blocking.length}</p>
          <p className="text-xs text-slate-500">Blocking failures</p>
        </Card>
        <Card className="text-center">
          <p className="text-2xl font-bold text-amber-600">{verify.length}</p>
          <p className="text-xs text-slate-500">Items to verify</p>
        </Card>
      </div>

      <Card>
        <h3 className="text-sm font-semibold text-slate-800">Executive summary</h3>
        <p className="mt-2 text-sm text-slate-700">
          {project.property.address ? (
            <>
              Site at <strong>{project.property.address}</strong> in zone{" "}
              <strong>{project.property.zone}</strong>
              {project.intent.aduTypes.length > 0 && (
                <>
                  {" "}
                  evaluating{" "}
                  <strong>{project.intent.aduTypes.join(", ")}</strong>
                </>
              )}
              . Verdict:{" "}
              <strong>
                {(project.verdict ?? "pending").replace(/_/g, " ")}
              </strong>
              .
            </>
          ) : (
            "Complete property intake for executive summary."
          )}
        </p>
        {blocking.length > 0 && (
          <ul className="mt-3 space-y-1">
            {blocking.map((f) => (
              <li key={f.id} className="flex items-center gap-2 text-sm text-red-700">
                <StatusBadge status={f.status} />
                {f.summary}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Button onClick={downloadReport} className="inline-flex items-center gap-2">
        <Download className="h-4 w-4" />
        Export report (Markdown)
      </Button>

      <p className="text-xs text-slate-400">
        Data stored locally in your browser (IndexedDB). PDF export and ProjectDox
        integration planned for Phase 2.
      </p>
    </div>
  );
}
