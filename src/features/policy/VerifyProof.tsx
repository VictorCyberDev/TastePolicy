"use client";
import { useState } from "react";
import "./policy.css";

const REASON: Record<string, string> = {
  MALFORMED: "This is not a TastePolicy proof, or it is damaged.",
  ALG_NOT_ALLOWED: "It uses a signing method this checker does not accept.",
  TYP_INVALID: "It is the wrong kind of token.",
  ISSUER_UNTRUSTED: "It was issued by someone this checker does not trust.",
  KEY_UNKNOWN: "It was signed with a key this checker does not know.",
  SIGNATURE_INVALID: "The signature does not match. It may have been altered.",
  EXPIRED: "It has expired.",
  NOT_YET_VALID: "It is not valid yet.",
  AUDIENCE_MISMATCH:
    "It was made for a different recipient than the one you entered.",
  VCT_NOT_ACCEPTED: "It is not a type of proof this checker accepts.",
  AUTHORITY_MISSING: "It does not carry the required cultural-only statement.",
  DISCLOSURE_INVALID: "A shared detail is malformed.",
  DISCLOSURE_DUPLICATE: "A shared detail appears twice.",
  DISCLOSURE_UNREFERENCED:
    "A shared detail was not signed by the issuer. It may have been altered.",
  STATUS_MISSING: "It does not say how to check whether it was withdrawn.",
  STATUS_FETCH_FAILED:
    "The withdrawal list could not be checked. It is treated as not valid.",
  STATUS_LIST_INVALID: "The withdrawal list is not trustworthy.",
  STATUS_INDEX_OUT_OF_RANGE: "It points outside the withdrawal list.",
  STATUS_INVALID: "It was withdrawn or the permission has ended.",
  STATUS_SUSPENDED: "The permission is paused right now.",
  KB_REQUIRED:
    "It must be shown together with a proof of who holds it, and that was missing.",
  KB_INVALID: "The proof of who holds it is not valid.",
  KB_NONCE_MISMATCH: "The challenge value does not match.",
  KB_AUDIENCE_MISMATCH: "The holder proof was made for a different recipient.",
  KB_SD_HASH_MISMATCH:
    "The shared details were changed after the holder signed.",
  REPLAY: "This proof was already used with this recipient.",
};
type Result = {
  valid: boolean;
  reasons: string[];
  claims?: Record<string, unknown>;
  status?: string;
  dryRun: boolean;
};
// A relying party checks a proof without any TastePolicy account.
export default function VerifyProof() {
  const [presentation, setPresentation] = useState(""),
    [audience, setAudience] = useState(""),
    [nonce, setNonce] = useState(""),
    [consume, setConsume] = useState(false),
    [result, setResult] = useState<Result | null>(null),
    [notice, setNotice] = useState("Paste a proof to check it."),
    [busy, setBusy] = useState(false);
  async function check() {
    setBusy(true);
    try {
      const r = await fetch("/api/attest/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          presentation: presentation.trim(),
          audience: audience.trim(),
          ...(nonce ? { nonce } : {}),
          dryRun: !consume,
        }),
      });
      const j = await r.json();
      if (j.status !== "available")
        throw Error(
          j.code === "NOT_CONFIGURED"
            ? "Proof checking is not configured in this environment."
            : "Check the values you entered.",
        );
      setResult(j.data);
      setNotice(
        j.data.valid
          ? "This proof is valid right now."
          : "This proof is not valid.",
      );
    } catch (e) {
      setResult(null);
      setNotice(e instanceof Error ? e.message : "Unavailable.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="policyPlane">
      <h1>Check a TastePolicy proof</h1>
      <p className="help">
        A proof says an agent was allowed to recommend one choice, for a short
        time. It never means anyone may buy, book or pay, and it stops being
        valid the moment the permission ends. Only what the holder chose to
        share is shown.
      </p>
      <p role="status" aria-live="polite">
        {notice}
      </p>
      <section>
        <label>
          Proof
          <textarea
            rows={6}
            value={presentation}
            onChange={(e) => setPresentation(e.target.value)}
            spellCheck={false}
            style={{ width: "100%", font: "0.8rem monospace" }}
          />
        </label>
        <div className="row">
          <label>
            Your address (the recipient it was made for)
            <input
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              placeholder="https://your-site.example"
            />
          </label>
          <label>
            Challenge (only if it is bound to a holder)
            <input value={nonce} onChange={(e) => setNonce(e.target.value)} />
          </label>
        </div>
        <label className="choice">
          <input
            type="checkbox"
            checked={consume}
            onChange={(e) => setConsume(e.target.checked)}
          />
          <span>
            Use this proof up, so it cannot be shown to this recipient again.
          </span>
        </label>
        <button
          disabled={
            busy || !presentation.trim() || !/^https:\/\//.test(audience.trim())
          }
          onClick={check}
        >
          Check proof
        </button>
      </section>
      {result && (
        <section aria-labelledby="res">
          <h2 id="res">{result.valid ? "Valid" : "Not valid"}</h2>
          {!result.valid && (
            <ul>
              {result.reasons.map((r) => (
                <li key={r}>{REASON[r] ?? r}</li>
              ))}
            </ul>
          )}
          {result.valid && result.claims && (
            <>
              <p className="help">Shared with you:</p>
              <dl>
                {[
                  "decision",
                  "candidate_name",
                  "candidate_id",
                  "permitted",
                  "context_key",
                  "agent_id",
                ]
                  .filter((k) => k in result.claims!)
                  .map((k) => (
                    <div key={k}>
                      <dt>{k.replace("_", " ")}</dt>
                      <dd>
                        {Array.isArray(result.claims![k])
                          ? (result.claims![k] as string[]).join(", ")
                          : String(result.claims![k])}
                      </dd>
                    </div>
                  ))}
                <div>
                  <dt>valid until</dt>
                  <dd>
                    {new Date(
                      Number(result.claims.exp) * 1000,
                    ).toLocaleString()}
                  </dd>
                </div>
              </dl>
              <p className="help">
                Authority: cultural preference only.{" "}
                {result.dryRun
                  ? "This check did not use the proof up."
                  : "This proof is now used up for you."}
              </p>
            </>
          )}
        </section>
      )}
    </main>
  );
}
