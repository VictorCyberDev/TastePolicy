import Link from "next/link";
import CompanyShell from "@/features/company/CompanyShell";
export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <CompanyShell>
      <div className="company-account-content">
        <nav className="company-account-nav" aria-label="Account sections">
          <Link href="/dashboard">Developer workspace</Link>
          <Link href="/account">Passport &amp; access</Link>
          <Link href="/account/rules">Rules &amp; ceilings</Link>
          <Link href="/account/leases">Leases &amp; proofs</Link>
          <Link href="/account/timeline">Authority timeline</Link>
          <Link href="/account/inspector">Decision details</Link>
        </nav>
        {children}
      </div>
    </CompanyShell>
  );
}
