"use client";
import { useEffect, useState } from "react";

type Linked = {
  familyId: string;
  clientName: string;
  scopes: string[];
  connectedAt: string;
  lastUsedAt: string | null;
  active: boolean;
};
const SCOPE: Record<string, string> = {
  PASSPORT_READ: "see that your Passport exists and its summary",
  TASTE_EVALUATE: "ask whether a choice fits your preference boundaries",
  RECEIPT_READ: "read the receipts of its own questions",
};
async function api<T>(op: string, body: object = {}): Promise<T> {
  const r = await fetch(`/api/account/${op}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (j.status !== "available") throw Error(j.code ?? "Unavailable");
  return j.data;
}
// Assistants you connected through "Sign in with TastePolicy" and the one
// place to disconnect them.
export default function ConnectedAgents() {
  const [list, setList] = useState<Linked[] | null>(null),
    [notice, setNotice] = useState("");
  async function load() {
    try {
      const l = await api<Linked[]>("connected-agents");
      setList(Array.isArray(l) ? l : []);
    } catch {
      setList([]);
    }
  }
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, []);
  return (
    <section aria-labelledby="linked-title">
      <h2 id="linked-title">Connected assistants</h2>
      <p>
        Assistants you allowed to ask TastePolicy about your preference
        boundaries. They can never buy, book or pay. Disconnecting ends their
        access at once.
      </p>
      <p role="status" aria-live="polite">
        {notice}
      </p>
      {list?.length === 0 && <p>No assistant is connected.</p>}
      {list?.map((a) => (
        <article key={a.familyId}>
          <h3>{a.clientName}</h3>
          <p>
            Can: {a.scopes.map((s) => SCOPE[s] ?? s).join("; ")}. Connected{" "}
            {new Date(a.connectedAt).toLocaleDateString()}
            {a.lastUsedAt
              ? `, last renewed ${new Date(a.lastUsedAt).toLocaleDateString()}`
              : ""}
            . {a.active ? "Active." : "Disconnected."}
          </p>
          <button
            disabled={!a.active}
            onClick={async () => {
              try {
                await api("disconnect-agent", { familyId: a.familyId });
                setNotice(`${a.clientName} was disconnected.`);
                await load();
              } catch {
                setNotice("Could not disconnect. Try again.");
              }
            }}
          >
            Disconnect {a.clientName}
          </button>
        </article>
      ))}
    </section>
  );
}
