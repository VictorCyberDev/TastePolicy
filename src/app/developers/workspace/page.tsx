import CompanyDocument from "@/features/company/CompanyDocument";
import WorkspaceControl from "@/features/company/WorkspaceControl";
import DeveloperWorkspace from "@/features/company/DeveloperWorkspace";

export const metadata = {
  title: "Developer workspace · TastePolicy",
  description:
    "Credentials, projects, environments, agents, bindings, metrics and billing for the TastePolicy developer platform.",
};
export default function Page() {
  return (
    <CompanyDocument
      eyebrow="DEVELOPER WORKSPACE"
      title="Build your first boundary."
      lead="Review your taste, create a private Passport and issue a credential without founder configuration."
    >
      <DeveloperWorkspace />
      <WorkspaceControl />
    </CompanyDocument>
  );
}
