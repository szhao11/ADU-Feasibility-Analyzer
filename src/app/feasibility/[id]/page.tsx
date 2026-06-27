import { FeasibilityWizard } from "@/components/feasibility/FeasibilityWizard";

export default async function FeasibilityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <FeasibilityWizard projectId={id} />;
}
