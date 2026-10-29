"use client";
import { useEffect, useRef, useState } from "react";
type State = {
  configured: boolean;
  plans: { mode: string; plan: string; state: string; provider: string }[];
};
async function call(
  op: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
) {
  const r = await fetch(`/api/billing/test/${op}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const value = await r.json();
  if (!r.ok || value.status !== "available")
    throw Error(
      value.code === "RECENT_AUTH_REQUIRED"
        ? "Sign in again before changing test billing."
        : `Provider test operation stopped: ${value.code ?? "UNAVAILABLE"}.`,
    );
  return value.data;
}
export default function BillingTestPanel({
  workspaces,
}: {
  workspaces: { id: string; label: string }[];
}) {
  const [selected, setSelected] = useState(""),
    [state, setState] = useState<State | null>(null),
    [notice, setNotice] = useState(
      "Select a workspace to inspect provider test billing.",
    ),
    [busy, setBusy] = useState(false),
    [url, setUrl] = useState("");
  const workspaceId = selected || workspaces[0]?.id || "",
    request = useRef({ workspaceId: "", key: "" });
  useEffect(() => {
    if (!workspaceId) return;
    const controller = new AbortController();
    call("status", { workspaceId }, controller.signal)
      .then((s: State) => {
        if (!controller.signal.aborted) {
          setState(s);
          setNotice(
            s.configured
              ? "Test settings are present. A completed provider checkout and signed webhook must confirm entitlement."
              : "Stripe test billing is not configured. The internal simulator is a separate workflow.",
          );
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setState(null);
          setNotice(
            e instanceof Error
              ? e.message
              : "Provider test billing is unavailable.",
          );
        }
      });
    return () => controller.abort();
  }, [workspaceId]);
  async function action(op: "checkout" | "cancel" | "status") {
    if (!workspaceId || busy) return;
    setBusy(true);
    try {
      if (op === "checkout") {
        if (request.current.workspaceId !== workspaceId)
          request.current = { workspaceId, key: crypto.randomUUID() };
        const r = await call(op, {
          workspaceId,
          idempotencyKey: request.current.key,
        });
        const u = new URL(r.url);
        if (
          u.protocol !== "https:" ||
          u.hostname !== "checkout.stripe.com" ||
          u.username ||
          u.password ||
          u.port
        )
          throw Error("Invalid test checkout destination.");
        setUrl(u.href);
        setNotice(
          "Test checkout created. Use only Stripe test payment data. Returning to this page does not confirm payment.",
        );
      } else if (op === "cancel") {
        await call(op, { workspaceId });
        setUrl("");
        setNotice(
          "Test cancellation requested. Refresh after its signed webhook confirms the state. Live authority and plan were not changed.",
        );
      } else {
        setState(await call("status", { workspaceId }));
        setNotice(
          "Provider billing state refreshed. Sandbox state does not grant live paid entitlement.",
        );
      }
    } catch (e) {
      setNotice(
        e instanceof Error ? e.message : "Provider test operation unavailable.",
      );
    } finally {
      setBusy(false);
    }
  }
  const paid = state?.plans.find(
    (p) => p.mode === "SANDBOX" && p.provider === "STRIPE",
  );
  return (
    <section
      className="billing-provider"
      aria-labelledby="billing-provider-title"
    >
      <h3 id="billing-provider-title">Stripe provider sandbox</h3>
      <p>
        Exercise a real provider checkout and signed webhook in test mode. No
        real charge or live paid entitlement is enabled by this integration.
      </p>
      <label>
        Provider test workspace
        <select
          value={workspaceId}
          onChange={(e) => {
            setSelected(e.target.value);
            setState(null);
            setUrl("");
          }}
        >
          <option value="">Choose workspace</option>
          {workspaces.map((w) => (
            <option value={w.id} key={w.id}>
              {w.label}
            </option>
          ))}
        </select>
      </label>
      <p aria-live="polite">{notice}</p>
      {paid && (
        <p>
          Stripe SANDBOX · {paid.plan} · {paid.state}
        </p>
      )}
      <button
        className="company-small-cta"
        disabled={
          busy || !state?.configured || !workspaceId || paid?.state === "ACTIVE"
        }
        onClick={() => void action("checkout")}
      >
        Create Stripe test checkout
      </button>{" "}
      <button
        className="company-small-cta"
        disabled={
          busy ||
          !state?.configured ||
          !workspaceId ||
          !paid ||
          paid.state === "CANCELED"
        }
        onClick={() => void action("cancel")}
      >
        Cancel Stripe test subscription
      </button>{" "}
      <button
        className="company-small-cta"
        disabled={busy || !workspaceId}
        onClick={() => void action("status")}
      >
        Refresh provider billing state
      </button>
      {url && (
        <p>
          <a href={url} target="_blank" rel="noopener noreferrer">
            Open Stripe test checkout ↗
          </a>
        </p>
      )}
    </section>
  );
}
