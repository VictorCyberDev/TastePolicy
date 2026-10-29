import Link from "next/link";
import "./company.css";
export function BoundaryMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 40 40" fill="none">
      <path
        d="M17 7H7v26h10M23 7h10v26H23"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path d="M20 14v12" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
export default function CompanyShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="company">
      <a className="company-skip" href="#company-content">
        Skip to content
      </a>
      <header className="company-header">
        <Link href="/" className="company-brand">
          <BoundaryMark />
          <span>
            TastePolicy<span className="company-brand-dot">.</span>
          </span>
        </Link>
        <nav aria-label="Company">
          <Link href="/product">Product</Link>
          <Link href="/developers">Developers</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/trust">Trust</Link>
        </nav>
        <Link className="company-small-cta" href="/dashboard">
          Open workspace <span aria-hidden="true">↗</span>
        </Link>
      </header>
      <div id="company-content" tabIndex={-1}>
        {children}
      </div>
      <footer className="company-footer">
        <div>
          <Link href="/" className="company-brand">
            <BoundaryMark />
            TastePolicy.
          </Link>
          <p>Your taste. Your rules. Any agent.</p>
          <p className="company-caption">
            Built by Victor Nnamdi. Independent founder project.
          </p>
        </div>
        <nav aria-label="Resources">
          <Link href="/docs">Documentation</Link>
          <Link href="/integrations">Integrations</Link>
          <Link href="/status">Status</Link>
          <Link href="/support">Contact</Link>
          <Link href="/security">Security</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <a href="https://github.com/VictorCyberDev/TastePolicy">
            Source code
          </a>
        </nav>
        <p className="company-footer-boundary">
          Preference authority only. Verification is not authorization.
        </p>
      </footer>
    </div>
  );
}
