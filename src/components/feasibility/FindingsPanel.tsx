"use client";

import type { RuleFinding } from "@/lib/types";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Card } from "@/components/ui/Form";

export function FindingsPanel({ findings }: { findings: RuleFinding[] }) {
  const grouped = findings.reduce<Record<string, RuleFinding[]>>((acc, f) => {
    (acc[f.category] ??= []).push(f);
    return acc;
  }, {});

  if (findings.length === 0) {
    return (
      <Card className="text-sm text-slate-500">
        Complete property and ADU type steps to generate regulatory findings.
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {Object.entries(grouped).map(([category, items]) => (
        <Card key={category} className="p-3">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
            {category}
          </h3>
          <ul className="space-y-2">
            {items.map((f) => (
              <li key={f.id} className="border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm leading-snug text-slate-800">{f.summary}</p>
                  <StatusBadge status={f.status} />
                </div>
                {f.detail && (
                  <p className="mt-1 text-xs text-slate-500">{f.detail}</p>
                )}
                <p className="mt-1 font-mono text-[10px] text-slate-400">
                  {f.citation.citation}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}
