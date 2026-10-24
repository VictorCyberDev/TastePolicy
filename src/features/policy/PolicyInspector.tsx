"use client";
import Link from "next/link";
import { useState } from "react";
import type { PolicyDecision } from "@/lib/policy/types";
import { usePolicyApi } from "./usePolicyApi";
import { BASIS_COPY, CHANGE_COPY, OUTCOME_COPY, STEP_COPY } from "./copy";
import "./policy.css";

type Explanation = {
  evaluationRef: string;
  base: { outcome: keyof typeof OUTCOME_COPY; basis: string; rules: string[] };
  final: PolicyDecision;
  counterfactuals: {
    change: string;
    detail: string;
    resultOutcome: keyof typeof OUTCOME_COPY;
  }[];
};
// Developer inspector: the recorded decision, one step at a time. Everything
// shown is recomputed from recorded inputs and must match what was stored.
export default function PolicyInspector() {
  const call = usePolicyApi();
  const [ref, setRef] = useState(""),
    [data, setData] = useState<Explanation | null>(null),
    [notice, setNotice] = useState(
      "Paste an evaluation reference from a response or receipt.",
    ),
    [busy, setBusy] = useState(false);
  return (
    <main className="policyPlane">
      <nav>
        <Link href="/account/rules">← Your rules</Link>
      </nav>
      <h1>Why was this the answer?</h1>
      <p className="help">
        Each step can only keep, lower or (with your permission) raise the
        answer. Hard rules stop the process.
      </p>
      <p role="status" aria-live="polite">
        {notice}
      </p>
      <section>
        <label>
          Evaluation reference
          <input
            value={ref}
            onChange={(e) => setRef(e.target.value.trim())}
            placeholder="tp_…"
            spellCheck={false}
          />
        </label>
        <button
          disabled={busy || !/^tp_[a-f0-9]{48}$/.test(ref)}
          onClick={async () => {
            setBusy(true);
            try {
              setData(
                await call<Explanation>("policy-explain", {
                  evaluationRef: ref,
                }),
              );
              setNotice("Recomputed from the recorded inputs.");
            } catch (e) {
              setData(null);
              setNotice(e instanceof Error ? e.message : "Unavailable.");
            } finally {
              setBusy(false);
            }
          }}
        >
          Explain
        </button>
      </section>
      {data && (
        <>
          <section aria-labelledby="result">
            <h2 id="result">Result</h2>
            <p>
              <span className="tag" data-outcome={data.final.outcome}>
                {OUTCOME_COPY[data.final.outcome]}
              </span>{" "}
              because: {BASIS_COPY[data.final.basis]}.
              {data.final.baseOutcome !== data.final.outcome && (
                <>
                  {" "}
                  The plain taste check said{" "}
                  <strong>{OUTCOME_COPY[data.final.baseOutcome]}</strong>.
                </>
              )}
            </p>
            <ol>
              {data.final.trace.map((t, i) => (
                <li key={i}>
                  <strong>{STEP_COPY[t.step]}</strong>: {t.action.toLowerCase()}{" "}
                  → {OUTCOME_COPY[t.outcome]}
                  {t.note ? ` · ${t.note}` : ""}
                  {t.rules?.length ? (
                    <span className="help"> · {t.rules.join(", ")}</span>
                  ) : null}
                </li>
              ))}
            </ol>
          </section>
          <section aria-labelledby="cf">
            <h2 id="cf">What would change it</h2>
            <p className="help">
              Each option was re-run to confirm it changes this answer. You make
              these changes; nothing happens automatically.
            </p>
            <ul>
              {data.counterfactuals.map((c, i) => (
                <li key={i}>
                  {CHANGE_COPY[c.change] ?? c.change} →{" "}
                  <span className="tag" data-outcome={c.resultOutcome}>
                    {OUTCOME_COPY[c.resultOutcome]}
                  </span>{" "}
                  <span className="help">{c.detail}</span>
                </li>
              ))}
              {data.counterfactuals.length === 0 && (
                <li className="help">
                  No single change would alter this answer.
                </li>
              )}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}
