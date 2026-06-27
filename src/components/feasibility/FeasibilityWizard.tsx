"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AssistantMessage, FeasibilityProject, WizardStep } from "@/lib/types";
import {
  loadProject,
  saveProject,
  loadAssistantMessages,
  saveAssistantMessages,
} from "@/lib/storage";
import { evaluateProject, computeVerdict } from "@/lib/rules/engine";
import { syncEnvelopeFromSitePlan } from "@/lib/geometry/site-plan";
import { StepNav, WIZARD_STEPS } from "@/components/feasibility/StepNav";
import { FindingsPanel } from "@/components/feasibility/FindingsPanel";
import { AssistantSidebar } from "@/components/feasibility/AssistantSidebar";
import { StepProperty } from "@/components/feasibility/steps/StepProperty";
import { StepEligibility } from "@/components/feasibility/steps/StepEligibility";
import { StepAduType } from "@/components/feasibility/steps/StepAduType";
import { StepEnvelope } from "@/components/feasibility/steps/StepEnvelope";
import { StepConstraints } from "@/components/feasibility/steps/StepConstraints";
import { StepUtilities } from "@/components/feasibility/steps/StepUtilities";
import { StepPermits } from "@/components/feasibility/steps/StepPermits";
import { StepReport } from "@/components/feasibility/steps/StepReport";
import { Button } from "@/components/ui/Form";
import { VerdictBadge } from "@/components/ui/StatusBadge";
import { ChevronLeft, ChevronRight } from "lucide-react";

function stepIndex(step: WizardStep): number {
  return WIZARD_STEPS.findIndex((s) => s.id === step);
}

export function FeasibilityWizard({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [project, setProject] = useState<FeasibilityProject | null>(null);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [completed, setCompleted] = useState<Set<WizardStep>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      const p = await loadProject(projectId);
      if (!p) {
        router.replace("/");
        return;
      }
      const msgs = await loadAssistantMessages(projectId);
      setProject(p);
      setMessages(msgs);
      setLoading(false);
    }
    init();
  }, [projectId, router]);

  const recompute = useCallback((p: FeasibilityProject): FeasibilityProject => {
    const envelope = syncEnvelopeFromSitePlan(
      p.sitePlan,
      p.envelope,
      p.property.frontSetbackFt
    );
    const merged = { ...p, envelope };
    const findings = evaluateProject(merged);
    const verdict = computeVerdict(findings);
    return { ...merged, findings, verdict };
  }, []);

  const updateProject = useCallback(
    async (p: FeasibilityProject) => {
      const updated = recompute(p);
      setProject(updated);
      await saveProject(updated);
    },
    [recompute]
  );

  const updateMessages = useCallback(
    async (msgs: AssistantMessage[]) => {
      setMessages(msgs);
      await saveAssistantMessages(projectId, msgs);
    },
    [projectId]
  );

  function goToStep(step: WizardStep) {
    if (!project) return;
    updateProject({ ...project, currentStep: step });
  }

  function nextStep() {
    if (!project) return;
    const idx = stepIndex(project.currentStep);
    if (idx < WIZARD_STEPS.length - 1) {
      const next = WIZARD_STEPS[idx + 1].id;
      setCompleted((prev) => new Set([...prev, project.currentStep]));
      updateProject({ ...project, currentStep: next });
    }
  }

  function prevStep() {
    if (!project) return;
    const idx = stepIndex(project.currentStep);
    if (idx > 0) {
      updateProject({ ...project, currentStep: WIZARD_STEPS[idx - 1].id });
    }
  }

  if (loading || !project) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-slate-500">
        Loading project…
      </div>
    );
  }

  const step = project.currentStep;
  const idx = stepIndex(step);

  return (
    <div className="flex h-screen flex-col bg-white">
      <header className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Burbank ADU Feasibility
          </p>
          <h1 className="text-sm font-semibold text-slate-900">
            {project.property.address || "New project"}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <VerdictBadge verdict={project.verdict} />
          <Button variant="ghost" onClick={() => router.push("/")}>
            All projects
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-48 shrink-0 border-r border-slate-200 p-4 lg:block">
          <StepNav
            current={step}
            completed={completed}
            onStepClick={goToStep}
          />
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <div className="min-w-0 flex-1 overflow-y-auto p-6">
              {step === "property" && (
                <StepProperty project={project} onChange={updateProject} />
              )}
              {step === "eligibility" && <StepEligibility project={project} />}
              {step === "adu_type" && (
                <StepAduType project={project} onChange={updateProject} />
              )}
              {step === "envelope" && (
                <StepEnvelope project={project} onChange={updateProject} />
              )}
              {step === "constraints" && (
                <StepConstraints project={project} onChange={updateProject} />
              )}
              {step === "utilities" && (
                <StepUtilities project={project} onChange={updateProject} />
              )}
              {step === "permits" && <StepPermits project={project} />}
              {step === "report" && <StepReport project={project} />}
            </div>

            <aside className="hidden w-72 shrink-0 overflow-y-auto border-l border-slate-200 bg-slate-50 p-4 xl:block">
              <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                Live findings
              </h2>
              <FindingsPanel findings={project.findings} />
            </aside>
          </div>

          <footer className="flex shrink-0 items-center justify-between border-t border-slate-200 px-6 py-3">
            <Button
              variant="secondary"
              onClick={prevStep}
              disabled={idx === 0}
              className="inline-flex items-center gap-1"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>
            <span className="text-xs text-slate-500">
              Step {idx + 1} of {WIZARD_STEPS.length} — {WIZARD_STEPS[idx].label}
            </span>
            <Button
              onClick={nextStep}
              disabled={idx === WIZARD_STEPS.length - 1}
              className="inline-flex items-center gap-1"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </footer>
        </main>

        <aside className="hidden w-80 shrink-0 lg:flex lg:flex-col">
          <AssistantSidebar
            project={project}
            messages={messages}
            onMessagesChange={updateMessages}
          />
        </aside>
      </div>
    </div>
  );
}
