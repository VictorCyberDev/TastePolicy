"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

type Preview = {
  clientName: string;
  redirectHost: string;
  scopes: string[];
  expiresInDays: number;
};
const CAN: Record<string, string> = {
  PASSPORT_READ: "See that your Passport exists and read its summary.",
  TASTE_EVALUATE:
    "Ask TastePolicy whether a choice fits your preference boundaries.",
  RECEIPT_READ: "Read the receipts of the questions it asked.",
};
const CANNOT = [
  "Buy, book, pay or send anything for you.",
  "Change your rules, your taste information or your sharing.",
  "See other people’s Passports.",
];
async function post(body: object) {
  const r = await fetch("/api/oauth/decision", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) throw Object.assign(Error(j.error ?? "error"), { code: j.error });
  return j;
}
export default function OAuthConsent() {
  const [params, setParams] = useState<Record<string, string> | null>(null),
    [preview, setPreview] = useState<Preview | null>(null),
    [state, setState] = useState<"loading" | "ready" | "signin" | "error">(
      "loading",
    ),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const t = setTimeout(async () => {
      const q = Object.fromEntries(new URLSearchParams(location.search));
      setParams(q);
      try {
        setPreview(await post({ params: q }));
        setState("ready");
      } catch {
        setState("error");
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);
  async function decide(approve: boolean) {
    setBusy(true);
    try {
      const { redirectTo } = await post({ params, approve });
      location.assign(redirectTo);
    } catch (e) {
      setBusy(false);
      setState(
        (e as { code?: string }).code === "login_required" ? "signin" : "error",
      );
    }
  }
  const next = encodeURIComponent(
    typeof location === "undefined" ? "" : location.pathname + location.search,
  );
  if (state === "loading")
    return (
      <main className="policyPlane">
        <p role="status" aria-live="polite">
          Checking the request…
        </p>
      </main>
    );
  if (state === "error")
    return (
      <main className="policyPlane">
        <h1>This connection request can’t be used</h1>
        <p>
          The request is incomplete or not allowed. Nothing was shared. Start
          the connection again from your assistant.
        </p>
      </main>
    );
  if (state === "signin")
    return (
      <main className="policyPlane">
        <h1>Sign in to continue</h1>
        <p>For your safety, connecting an assistant needs a recent sign-in.</p>
        <Link href={`/account?next=${next}`}>Sign in</Link>
      </main>
    );
  return (
    <main className="policyPlane">
      <h1>
        {preview!.clientName} wants to ask TastePolicy about your preference
        boundaries
      </h1>
      <p className="help">
        You will be sent back to {preview!.redirectHost} after you decide.
      </p>
      <section aria-labelledby="can">
        <h2 id="can">It will be able to</h2>
        <ul>
          {preview!.scopes.map((s) => (
            <li key={s}>{CAN[s] ?? s}</li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="cannot">
        <h2 id="cannot">It will not be able to</h2>
        <ul>
          {CANNOT.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </section>
      <p>
        Access renews on its own for up to {preview!.expiresInDays} days. You
        can disconnect it at any time under “Connected assistants” on your
        account page.
      </p>
      <button disabled={busy} onClick={() => decide(true)}>
        Allow
      </button>{" "}
      <button className="quiet" disabled={busy} onClick={() => decide(false)}>
        Don’t allow
      </button>
    </main>
  );
}
