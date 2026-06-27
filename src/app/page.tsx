"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Trash2, HardHat } from "lucide-react";
import {
  createEmptyProject,
  listProjects,
  saveProject,
  deleteProject,
} from "@/lib/storage";
import type { FeasibilityProject } from "@/lib/types";
import { Button, Card } from "@/components/ui/Form";
import { VerdictBadge } from "@/components/ui/StatusBadge";

export default function HomePage() {
  const router = useRouter();
  const [projects, setProjects] = useState<FeasibilityProject[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    listProjects().then((p) => {
      setProjects(p);
      setReady(true);
    });
  }, []);

  async function startNew() {
    const project = createEmptyProject();
    await saveProject(project);
    router.push(`/feasibility/${project.id}`);
  }

  async function remove(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    await deleteProject(id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-white">
              <HardHat className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">ADU Feasibility</h1>
              <p className="text-xs text-slate-500">
                Builder screening · Burbank · local-first
              </p>
            </div>
          </div>
          <Button onClick={startNew} className="inline-flex items-center gap-2">
            <Plus className="h-4 w-4" />
            New feasibility
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        <Card className="mb-8 border-slate-300 bg-slate-900 text-white">
          <h2 className="text-sm font-semibold">How it works</h2>
          <p className="mt-2 text-sm text-slate-300">
            Walk through property intake, eligibility, ADU type, envelope checks,
            site constraints, utilities, and permit pathway. Rules are encoded from
            BMC § 10-1-620.3 and the Burbank ADU handout (7/11/2024). All project
            data stays in your browser — no account required.
          </p>
        </Card>

        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Recent projects
        </h2>

        {!ready && (
          <p className="text-sm text-slate-500">Loading local projects…</p>
        )}

        {ready && projects.length === 0 && (
          <Card className="text-center text-sm text-slate-500">
            No projects yet. Start a new Burbank feasibility study.
          </Card>
        )}

        <ul className="space-y-2">
          {projects.map((p) => (
            <li key={p.id}>
              <Link href={`/feasibility/${p.id}`}>
                <Card className="flex items-center justify-between transition-colors hover:border-slate-400">
                  <div>
                    <p className="font-medium text-slate-900">
                      {p.property.address || "Untitled project"}
                    </p>
                    <p className="text-xs text-slate-500">
                      {p.property.zone} · Updated{" "}
                      {new Date(p.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <VerdictBadge verdict={p.verdict} />
                    <button
                      type="button"
                      onClick={(e) => remove(p.id, e)}
                      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      aria-label="Delete project"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
