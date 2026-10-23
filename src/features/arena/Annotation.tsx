"use client";
import { useEffect, useRef, useState } from "react";
import "./arena.css";
import "./annotation.css";
type Packet = {
  schemaVersion: string;
  packetHash: string;
  contentNotice: string;
  introduction: string[];
  helpText: string;
  practice: {
    proposal: string;
    evidence: string;
    instruction: string;
    question: string;
    choices: string[];
  };
  cases: {
    caseId: string;
    proposal: string;
    context: {
      domain: string;
      price: "NOT PROVIDED" | { amount: number; currency: string };
    };
    signals: { label: string; domain: string }[];
    facts: string[];
    evidence: { text: string; status: string };
    question: string;
    choices: string[];
  }[];
};
const preferenceNames: Record<string, string> = {
  artist: "Music",
  movie: "Movies",
  book: "Books",
  brand: "Brands",
  tv_show: "TV",
};
export default function Annotation() {
  const [packet, setPacket] = useState<Packet | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const [consent, setConsent] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState<
    "intro" | "practice" | "questions" | "review"
  >("intro");
  const [index, setIndex] = useState(0);
  const [practiceChoice, setPracticeChoice] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [stage, index]);
  const current = packet?.cases[index];
  const complete =
    !!packet &&
    packet.cases.every((c) => c.choices.includes(answers[c.caseId]));
  const intro = packet?.introduction;
  async function openStudy() {
    setLoading(true);
    setNotice("");
    try {
      const r = await fetch("/win-gate/pilot.json");
      if (!r.ok) throw Error();
      const next: Packet = await r.json();
      if (
        next.schemaVersion !== "win-gate-blinded-pilot-v3" ||
        next.cases.length !== 18
      )
        throw Error();
      setPacket(next);
    } catch {
      setNotice(
        "The study is unavailable. No answers were sent. Please try again later.",
      );
    } finally {
      setLoading(false);
    }
  }
  function download() {
    if (!packet || !complete || !consent || downloaded) return;
    const participantId = crypto.randomUUID();
    const response = {
      schemaVersion: "win-gate-human-response-v3",
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
      "Your responses were downloaded. No answers were sent to a server. Share the file once, privately, with the study coordinator.",
    );
  }
  return (
    <main className="arena annotation">
      <p className="studyEyebrow">Assistant decision study</p>
      {stage === "intro" && (
        <>
          <h1 ref={heading} tabIndex={-1}>
            What should the assistant do?
          </h1>
          {!packet && (
            <p>
              Read a few short situations and choose what an AI assistant should
              do.
            </p>
          )}
          {!packet && (
            <button disabled={loading} onClick={openStudy}>
              {loading ? "Loading…" : "Read about the study"}
            </button>
          )}
          {intro?.map((p) => (
            <p key={p}>{p}</p>
          ))}
          {packet && (
            <>
              <p>{packet.contentNotice}</p>
              <p>
                Taking part is optional. We do not ask for your name, email or
                personal details. No answers are sent to a server. You can stop
                at any time. If you agree, download your responses at the end
                and share the file privately with the study coordinator. Please
                answer on your own.
              </p>
              <label className="arenaCheck">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                I agree to take part anonymously.
              </label>
              <button disabled={!consent} onClick={() => setStage("practice")}>
                See how this works
              </button>
            </>
          )}
        </>
      )}
      {packet && stage !== "intro" && (
        <>
          <p aria-live="polite">
            {stage === "practice"
              ? "Practice — not part of your 18 answers"
              : stage === "review"
                ? "Review your 18 answers"
                : `Question ${index + 1} of ${packet.cases.length}`}
          </p>
          {stage !== "practice" && (
            <progress
              aria-label="Study progress"
              value={stage === "review" ? packet.cases.length : index + 1}
              max={packet.cases.length}
            />
          )}
          <details className="studyHelp">
            <summary>What does taste match mean?</summary>
            <p>{packet.helpText}</p>
          </details>
        </>
      )}
      {packet && stage === "practice" && (
        <>
          <h1 ref={heading} tabIndex={-1}>
            How this works
          </h1>
          <p>
            This is a practice example. Try selecting any answer to see how the
            buttons work. We will not tell you which answer to choose. This
            answer is not included in your responses.
          </p>
          <section className="arenaCard">
            <h2>The situation</h2>
            <p>{packet.practice.proposal}</p>
            <h2>What the assistant knows</h2>
            <p className="studyScore">{packet.practice.evidence}</p>
            <small>
              Higher means a stronger match. This is not a guarantee that the
              person will like it.
            </small>
            <p>The person has said: “{packet.practice.instruction}”</p>
          </section>
          <fieldset className="studyChoices">
            <legend>{packet.practice.question}</legend>
            {packet.practice.choices.map((choice) => (
              <label key={choice} className="studyChoice">
                <input
                  type="radio"
                  name="practice"
                  checked={practiceChoice === choice}
                  onChange={() => setPracticeChoice(choice)}
                />
                <span>{choice}</span>
              </label>
            ))}
          </fieldset>
          <nav aria-label="Study navigation">
            <button onClick={() => setStage("intro")}>Previous</button>
            <button
              disabled={!practiceChoice}
              onClick={() => setStage("questions")}
            >
              Start the 18 questions
            </button>
          </nav>
        </>
      )}
      {packet && current && stage === "questions" && (
        <>
          <h1 ref={heading} tabIndex={-1}>
            The situation
          </h1>
          <p>{current.proposal}</p>
          <section className="arenaCard" aria-label="What the assistant knows">
            <h2>What the assistant knows</h2>
            <p className="studyScore">{current.evidence.text}</p>
            {current.evidence.status === "available" && (
              <small>
                Higher means a stronger match. This is not a guarantee that the
                person will like it.
              </small>
            )}
            {current.signals.length > 0 && (
              <>
                <h3>Known preferences</h3>
                <p>
                  {current.signals
                    .map((s) => preferenceNames[s.domain] ?? s.domain)
                    .join(", ")}
                  .
                </p>
              </>
            )}
            {current.facts.length > 0 && (
              <>
                <h3>Explicit instructions</h3>
                <ul>
                  {current.facts.map((fact, i) => (
                    <li key={i}>{fact}</li>
                  ))}
                </ul>
              </>
            )}
            {typeof current.context.price !== "string" ? (
              <p>
                This option costs {current.context.price.currency}{" "}
                {current.context.price.amount}.
              </p>
            ) : (
              current.facts.some((f) => f.includes("maximum budget")) && (
                <p>This option&apos;s price is not known.</p>
              )
            )}
          </section>
          <fieldset className="studyChoices">
            <legend>{current.question}</legend>
            {current.choices.map((choice) => (
              <label key={choice} className="studyChoice">
                <input
                  type="radio"
                  name={current.caseId}
                  checked={answers[current.caseId] === choice}
                  onChange={() =>
                    setAnswers((prev) => ({
                      ...prev,
                      [current.caseId]: choice,
                    }))
                  }
                />
                <span>{choice}</span>
              </label>
            ))}
          </fieldset>
          <nav aria-label="Study navigation">
            <button
              onClick={() =>
                index === 0 ? setStage("practice") : setIndex(index - 1)
              }
            >
              Previous
            </button>
            <button
              disabled={!answers[current.caseId]}
              onClick={() =>
                index === packet.cases.length - 1
                  ? setStage("review")
                  : setIndex(index + 1)
              }
            >
              {index === packet.cases.length - 1 ? "Review answers" : "Next"}
            </button>
          </nav>
        </>
      )}
      {packet && stage === "review" && (
        <>
          <h1 ref={heading} tabIndex={-1}>
            Review your answers
          </h1>
          <p>
            You answered {Object.keys(answers).length} of {packet.cases.length}{" "}
            questions. You can change an answer before downloading.
          </p>
          <ol className="studyReview">
            {packet.cases.map((c, i) => (
              <li key={c.caseId}>
                <p>
                  Question {i + 1}: {answers[c.caseId] ?? "No answer yet"}
                </p>
                <button
                  disabled={downloaded}
                  onClick={() => {
                    setIndex(i);
                    setStage("questions");
                  }}
                >
                  Change answer to question {i + 1}
                </button>
              </li>
            ))}
          </ol>
          <nav aria-label="Study navigation">
            <button
              disabled={downloaded}
              onClick={() => {
                setIndex(packet.cases.length - 1);
                setStage("questions");
              }}
            >
              Previous
            </button>
            <button
              disabled={!complete || !consent || downloaded}
              onClick={download}
            >
              Download Responses
            </button>
          </nav>
        </>
      )}
      <p role="status">{notice}</p>
    </main>
  );
}
