import { AppShell } from "@/components/layout/AppShell";
import { ProjectsDashboard } from "@/components/feasibility/ProjectsDashboard";

export default function HomePage() {
  return (
    <AppShell>
      <ProjectsDashboard />
    </AppShell>
  );
}
