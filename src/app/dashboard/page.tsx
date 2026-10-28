import CompanyDocument from "@/features/company/CompanyDocument";
import DeveloperWorkspace from "@/features/company/DeveloperWorkspace";
export default function Page() {
  return (
    <CompanyDocument
      eyebrow="DEVELOPER WORKSPACE"
      title="Build your first boundary."
      lead="Review your taste, create a private Passport and issue a credential without founder configuration."
    >
      <DeveloperWorkspace />
    </CompanyDocument>
  );
}
