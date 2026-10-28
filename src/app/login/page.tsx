import CompanyDocument from "@/features/company/CompanyDocument";
import AuthEntry from "@/features/company/AuthEntry";
export default function Page() {
  return (
    <CompanyDocument
      eyebrow="WELCOME BACK"
      title="Your workspace awaits."
      lead="Sign in to manage your Passport, rules, developer credentials and linked assistants."
    >
      <AuthEntry signup={false} />
    </CompanyDocument>
  );
}
