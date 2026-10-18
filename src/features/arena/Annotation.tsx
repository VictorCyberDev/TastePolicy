"use client";
import { useState } from "react";
import "./arena.css";
type Packet = {
  packetHash: string;
  contentNotice: string;
  cases: {
    caseId: string;
    proposal: string;
    context: {
      domain: string;
      price: "NOT PROVIDED" | { amount: number; currency: string };
    };
    signals: { label: string; domain: string }[];
    facts: string[];
    evidenceAvailability: string;
    question: string;
    choices: string[];
  }[];
};
export default function Annotation() {
  const [packet, setPacket] = useState<Packet | null>(null),
    [answers, setAnswers] = useState<Record<string, string>>({}),
    [notice, setNotice] = useState(""),
    [consent, setConsent] = useState(false),
    [downloaded, setDownloaded] = useState(false);
  return (
    <main className="arena">
      <h1>Assistant decision study</h1>
      <p>
        Judge the situation, not a product. No name, email, demographic
        information or system score is requested. Participation is optional; you
        may stop without downloading responses. These are synthetic scenarios,
        not real people. If information is insufficient, choose CANNOT JUDGE.
      </p>
      <p>
        No answers are sent to a server. After completion, download and share
        the file privately with the study coordinator only if you agree. Do not
        inspect benchmark answers or coordinate responses.
      </p>
      <label className="arenaCheck">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        I agree to provide anonymous scenario judgments for this small pilot.
      </label>
      <button
        disabled={!consent}
        onClick={async () => {
          try {
            const r = await fetch("/win-gate/pilot.json");
            if (!r.ok) throw Error();
            setPacket(await r.json());
          } catch {
            setNotice("Packet unavailable. No answers were submitted.");
          }
        }}
      >
        Open independent annotation packet
      </button>
      <p role="status">{notice}</p>
      {packet && (
        <>
          <p>{packet.contentNotice}</p>
          {packet.cases.map((c) => (
            <fieldset className="arenaCard" key={c.caseId}>
              <legend>Situation {c.caseId}</legend>
              <p>{c.proposal}</p>
              <p>{c.evidenceAvailability}</p>
              <details open>
                <summary>Information supplied to the assistant</summary>
                <p>
                  Domain: {c.context.domain}. Price:{" "}
                  {typeof c.context.price === "string"
                    ? "not provided"
                    : `${c.context.price.currency} ${c.context.price.amount}`}
                  .
                </p>
                <p>
                  Known preferences span{" "}
                  {c.signals.map((s) => s.domain).join(", ")}. Specific
                  identity/affinity is not supplied; you may choose CANNOT
                  JUDGE.
                </p>
                <ul>
                  {c.facts.length ? (
                    c.facts.map((f, i) => <li key={i}>{f}</li>)
                  ) : (
                    <li>No additional explicit constraint is supplied.</li>
                  )}
                </ul>
              </details>
              <p>{c.question}</p>
              {c.choices.map((choice) => (
                <label className="arenaCheck" key={choice}>
                  <input
                    type="radio"
                    name={c.caseId}
                    value={choice}
                    checked={answers[c.caseId] === choice}
                    onChange={() =>
                      setAnswers({ ...answers, [c.caseId]: choice })
                    }
                  />
                  {choice}
                </label>
              ))}
            </fieldset>
          ))}
          <button
            disabled={
              downloaded ||
              !consent ||
              Object.keys(answers).length !== packet.cases.length
            }
            onClick={() => {
              const participantId = crypto.randomUUID();
              const response = {
                schemaVersion: "win-gate-human-response-v1",
                packetHash: packet.packetHash,
                participantId,
                answeredAt: new Date().toISOString(),
                answers: packet.cases.map((c) => ({
                  caseId: c.caseId,
                  choice: answers[c.caseId],
                })),
              };
              const url = URL.createObjectURL(
                new Blob([JSON.stringify(response, null, 2)], {
                  type: "application/json",
                }),
              );
              const a = document.createElement("a");
              a.href = url;
              a.download = `anonymous-response-${participantId}.json`;
              a.click();
              setDownloaded(true);
              URL.revokeObjectURL(url);
              setNotice(
                "Downloaded locally. No submission or genuine-human verification has been claimed. Share once privately with the coordinator.",
              );
            }}
          >
            Download anonymous responses
          </button>
        </>
      )}
    </main>
  );
}
