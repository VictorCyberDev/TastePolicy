import Link from "next/link";
import "@/components/brand/brand.css";
import "./human-shell.css";

export const PRIMARY_NAV = [
  { href: "/product", label: "Product" },
  { href: "/experience", label: "Use cases" },
  { href: "/developers", label: "Developers" },
  { href: "/trust", label: "Trust" },
] as const;

export function Wordmark() {
  return (
    <Link href="/" className="tp-wordmark" aria-label="TastePolicy home">
      <svg viewBox="0 0 40 40" width="30" height="30" aria-hidden="true">
        <path
          d="M17 7H7v26h10M23 7h10v26H23"
          stroke="currentColor"
          strokeWidth="4"
          fill="none"
        />
        <circle
          cx="20"
          cy="20"
          r="4.5"
          style={{ fill: "var(--tp-vermilion)" }}
        />
      </svg>
      <span>
        TastePolicy<b>.</b>
      </span>
    </Link>
  );
}

// The human product's frame: light by design, one calm nav, the technical
// destinations one deliberate step away.
export default function HumanShell({
  children,
  active,
}: {
  children: React.ReactNode;
  active?: string;
}) {
  return (
    <div className="tp tp-shell">
      <a className="tp-skip" href="#tp-main">
        Skip to content
      </a>
      <header className="tp-shell-head">
        <Wordmark />
        <nav aria-label="Primary">
          {PRIMARY_NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active === n.href ? "page" : undefined}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <Link className="tp-btn" data-size="sm" href="/dashboard">
          Open TastePolicy
        </Link>
      </header>
      <div id="tp-main" tabIndex={-1}>
        {children}
      </div>
      <footer className="tp-shell-foot">
        <div>
          <Wordmark />
          <p>AI that helps without replacing you.</p>
          <p className="tp-muted">
            Preference authority only. It never books, buys, pays or messages.
            Built by Victor Nnamdi, an independent founder project.
          </p>
        </div>
        <nav aria-label="Resources">
          <Link href="/judge">Judge walkthrough</Link>
          <Link href="/docs">Documentation</Link>
          <Link href="/integrations">Integrations</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/status">Status</Link>
          <Link href="/security">Security</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/support">Contact</Link>
          <a href="https://github.com/VictorCyberDev/TastePolicy">
            Source code
          </a>
        </nav>
      </footer>
    </div>
  );
}
