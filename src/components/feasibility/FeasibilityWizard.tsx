"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AssistantMessage, FeasibilityProject, WizardStep } from "@/lib/types";
import {
  loadProject,
  saveProject,
  loadAssistantMessages,
  saveAssistantMessages,
  migrateWizardStep,
} from "@/lib/storage";
import { evaluateProject, computeVerdict } from "@/lib/rules/engine";
import { syncPropertyFromSitePlan } from "@/lib/property/sync-from-site-plan";
import { syncEnvelopeFromSitePlan } from "@/lib/geometry/site-plan";
import { getSitePlanSyncOptions } from "@/lib/rules/envelope-requirements";
import { AppShell } from "@/components/layout/AppShell";
import { StepNav, WIZARD_STEPS } from "@/components/feasibility/StepNav";
import { AssistantSidebar } from "@/components/feasibility/AssistantSidebar";
import { CollapsiblePanel } from "@/components/ui/CollapsiblePanel";
import { StepProperty } from "@/components/feasibility/steps/StepProperty";
import { StepEligibilityEnvelope } from "@/components/feasibility/steps/StepEligibilityEnvelope";
import { StepAduType } from "@/components/feasibility/steps/StepAduType";
import { StepConstraints } from "@/components/feasibility/steps/StepConstraints";
import { StepUtilities } from "@/components/feasibility/steps/StepUtilities";
import { StepPermits } from "@/components/feasibility/steps/StepPermits";
import { StepReport } from "@/components/feasibility/steps/StepReport";
import { Button } from "@/components/ui/Form";
import { VerdictBadge } from "@/components/ui/StatusBadge";
import { ChevronLeft, ChevronRight } from "lucide-react";

function stepIndex(step: WizardStep): number {
  const idx = WIZARD_STEPS.findIndex((s) => s.id === step);
  return idx >= 0 ? idx : 0;
}

function recomputeProject(p: FeasibilityProject): FeasibilityProject {
  const property = syncPropertyFromSitePlan(p.property, p.sitePlan);
  const withProperty = { ...p, property };
  const envelope = syncEnvelopeFromSitePlan(
    withProperty.sitePlan,
    withProperty.envelope,
    getSitePlanSyncOptions(withProperty)
  );
  const merged = { ...withProperty, envelope };
  const findings = evaluateProject(merged);
  const verdict = computeVerdict(findings);
  return { ...merged, findings, verdict };
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
      const initial = recomputeProject(p);
      setProject(initial);
      await saveProject(initial);
      setMessages(msgs);
      setLoading(false);
    }
    init();
  }, [projectId, router]);

  const recompute = useCallback(recomputeProject, []);

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
    updateProject({ ...project, currentStep: migrateWizardStep(step) });
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
      <AppShell>
        <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
          Loading project…
        </div>
      </AppShell>
    );
  }

  const step = migrateWizardStep(project.currentStep);
  const idx = stepIndex(step);

  return (
    <AppShell>
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Burbank ADU Feasibility
            </p>
            <h1 className="truncate text-sm font-semibold text-slate-900">
              {project.property.address || "New project"}
            </h1>
          </div>
          <VerdictBadge verdict={project.verdict} />
        </header>

        <StepNav current={step} completed={completed} onStepClick={goToStep} />

        <div className="flex min-h-0 flex-1">
          <main className="flex min-w-0 flex-1 flex-col">
            <div className="min-w-0 flex-1 overflow-y-auto p-6">
              {step === "property" && (
                <StepProperty project={project} onChange={updateProject} />
              )}
              {step === "eligibility_envelope" && (
                <StepEligibilityEnvelope
                  project={project}
                  onChange={updateProject}
                  onGoToProperty={() => goToStep("property")}
                />
              )}
              {step === "adu_type" && (
                <StepAduType project={project} onChange={updateProject} />
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

          <CollapsiblePanel
            title="Code Assistant"
            side="right"
            storageKey={`assistant-open:${projectId}`}
            expandedWidthClass="w-80"
          >
            <AssistantSidebar
              project={project}
              messages={messages}
              onMessagesChange={updateMessages}
              embedded
            />
          </CollapsiblePanel>
        </div>
      </div>
    </AppShell>
  );
}
