"use client";
import { useEffect, useState } from "react";
type Probe = { status: string; checks: Record<string, string> };
export default function StatusPanel() {
  const [probe, setProbe] = useState<Probe | null>(null),
    [error, setError] = useState(false),
    [checked, setChecked] = useState("");
  async function refresh() {
    try {
      const r = await fetch("/api/ready", {
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
      const data = await r.json();
      if (!data.checks) throw Error();
      setError(false);
      setProbe(data);
      setChecked(new Date().toISOString());
    } catch {
      setError(true);
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/ready", { cache: "no-store", signal: controller.signal })
      .then(async (r) => {
        const data = await r.json();
        if (!data.checks) throw Error();
        setProbe(data);
        setChecked(new Date().toISOString());
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, []);
  return (
    <section aria-live="polite">
      <h2>
        {error
          ? "Probe could not complete"
          : probe?.status === "ready"
            ? "Application readiness: ready"
            : probe
              ? "Application readiness: not ready"
              : "Checking application readiness…"}
      </h2>
      <p>
        This is a fresh point-in-time probe. “Configured” means a setting
        exists; it does not prove provider reachability or a historical uptime
        percentage.
      </p>
      <div className="company-status-grid">
        {Object.entries(probe?.checks ?? {}).map(([key, value]) => (
          <article key={key}>
            <strong>{key.replaceAll("_", " ")}</strong>
            <span>{value}</span>
          </article>
        ))}
      </div>
      <p className="company-caption">
        {checked ? `Last checked: ${checked}` : "No result recorded yet."}
      </p>
      <button onClick={() => void refresh()} className="company-small-cta">
        Refresh probe
      </button>
    </section>
  );
}
