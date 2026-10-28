import CompanyDocument from "@/features/company/CompanyDocument";
import AuthEntry from "@/features/company/AuthEntry";
export default function Page() {
  return (
    <CompanyDocument
      eyebrow="GET STARTED"
      title="Build your boundary."
      lead="Create a personal evaluation account. No payment is required. Use public cultural entities and your own preferences only."
    >
      <AuthEntry signup={true} />
    </CompanyDocument>
  );
}
