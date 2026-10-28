"use client";
import { useEffect, useState } from "react";

type View = {
  mode: "MINIMAL" | "STANDARD";
  claims: Record<string, boolean>;
  required: string[];
};
// Words for the optional claims, in the order a person thinks about them.
const OPTIONAL: [string, string][] = [
  ["candidate_name", "the name of the choice"],
  ["candidate_id", "the choice's identifier"],
  ["context_key", "the situation's label"],
  ["agent_id", "which assistant it was issued to"],
  ["policy", "which version of your rules applied"],
];
async function api<T>(op: string, body: object): Promise<T> {
  const r = await fetch(`/api/account/${op}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (j.status !== "available") throw Error(j.code ?? "Unavailable");
  return j.data;
}
// What a portable proof is allowed to say. Smallest by default; the person can
// let it carry plain-language details, one at a time.
export default function ProofPrivacy({ passportRef }: { passportRef: string }) {
  const [view, setView] = useState<View | null>(null),
    [notice, setNotice] = useState("");
  useEffect(() => {
    const t = setTimeout(() => {
      api<View>("proof-privacy-get", { passportRef })
        .then((v) =>
          v && typeof v.claims === "object" && v.claims
            ? setView(v)
            : setNotice("Proof privacy could not be loaded."),
        )
        .catch(() => setNotice("Proof privacy could not be loaded."));
    }, 0);
    return () => clearTimeout(t);
  }, [passportRef]);
  async function save(mode: View["mode"], claims: Record<string, boolean>) {
    try {
      setView(
        await api<View>("proof-privacy-set", { passportRef, mode, claims }),
      );
      setNotice(
        "Saved. New proofs follow this; proofs already issued do not change.",
      );
    } catch (e) {
      setNotice(
        (e as Error).message === "RECENT_AUTH_REQUIRED"
          ? "Letting proofs say more needs a recent sign-in. Sign in again, then retry."
          : "That did not save. Nothing was changed.",
      );
    }
  }
  return (
    <fieldset>
      <legend>Proof privacy</legend>
      <p>
        When an assistant shows someone proof of its permission, the proof can
        say which choice, situation and assistant it is about. By default it
        says none of that: only that the permission is real, what it allows, and
        a fingerprint the other side can check against its own copy of the
        choice.
      </p>
      {notice && (
        <p role="status" aria-live="polite">
          {notice}
        </p>
      )}
      {view && (
        <>
          <ul>
            {OPTIONAL.map(([key, label]) => (
              <li key={key}>
                <label>
                  <input
                    type="checkbox"
                    checked={!!view.claims[key]}
                    onChange={(e) =>
                      void save(view.mode, {
                        ...view.claims,
                        [key]: e.target.checked,
                      })
                    }
                  />{" "}
                  May include {label}
                </label>
              </li>
            ))}
          </ul>
          <p>
            Always included, because a proof cannot be checked without them: the
            decision, what it allows, and the fingerprints of the choice and
            situation.
          </p>
          <button
            onClick={() =>
              void save(
                "MINIMAL",
                Object.fromEntries(OPTIONAL.map(([k]) => [k, false])),
              )
            }
          >
            Share nothing extra
          </button>
        </>
      )}
    </fieldset>
  );
}
