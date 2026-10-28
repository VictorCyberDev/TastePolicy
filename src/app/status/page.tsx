import CompanyDocument from "@/features/company/CompanyDocument";
import StatusPanel from "@/features/company/StatusPanel";
export default function Page() {
  return (
    <CompanyDocument
      eyebrow="SERVICE STATUS"
      title="A live view of readiness."
      lead="Database, authentication and provider configuration are reported separately. No historical SLA is implied."
    >
      <StatusPanel />
      <section>
        <h2>Report an incident</h2>
        <p>
          Contact victornnajiofor1@gmail.com with a request ID and approximate
          time. Do not include credentials or private preference records.
        </p>
      </section>
    </CompanyDocument>
  );
}
