import CompanyShell from "./CompanyShell";
export default function CompanyDocument({
  eyebrow,
  title,
  lead,
  children,
}: {
  eyebrow: string;
  title: string;
  lead: string;
  children: React.ReactNode;
}) {
  return (
    <CompanyShell>
      <main className="company-document">
        <p className="company-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="company-lead">{lead}</p>
        {children}
      </main>
    </CompanyShell>
  );
}
