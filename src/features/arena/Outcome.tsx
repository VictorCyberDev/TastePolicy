import {
  boundedContinuation,
  type AgentDecision,
} from "@/lib/agent/continuation";
const copy = {
  ALLOW: ["✓", "Evidence permits a recommendation or draft."],
  ASK: ["?", "Pause. Ask for the missing information."],
  REJECT: [
    "×",
    "Stop. Respect the explicit rule or evaluate a different option.",
  ],
  UNAVAILABLE: ["—", "Pause. Missing evidence is not negative preference."],
};
export default function Outcome({
  decision,
  label,
  reason,
}: {
  decision: AgentDecision;
  label: string;
  reason: string;
}) {
  const continuation = boundedContinuation(decision);
  return (
    <section
      className="arenaOutcome"
      data-decision={decision}
      aria-label="Preference authorization"
      aria-live="polite"
    >
      <p className="eyebrow">{label}</p>
      <h2>
        <span aria-hidden="true">{copy[decision][0]} </span>
        {decision}
      </h2>
      <p>{copy[decision][1]}</p>
      <p>{reason}</p>
      <h3>What the agent may do next</h3>
      <ul>
        {continuation.permitted.map((a) => (
          <li key={a}>{a}</li>
        ))}
      </ul>
      <p>
        <strong>Not granted:</strong> purchase · pay · book · send private
        information.
      </p>
      <p>Automatic retry: off. Experimental cultural policy.</p>
    </section>
  );
}
