import "./brand.css";
import { spectrumColor, spectrumOf } from "./Tasteprint";
import { ACTION_HUMAN, OUTCOME_HUMAN, type Outcome } from "@/lib/human/copy";
import { SUBJECTIVE_ACTIONS, type SubjectiveAction } from "@/lib/policy/types";

export function CultureTiles({
  items,
}: {
  items: { name: string; kind?: string }[];
}) {
  return (
    <ul className="tp-tiles" aria-label="Cultural anchors">
      {items.map((i) => (
        <li
          key={i.name}
          className="tp-tile"
          style={
            {
              "--tile": spectrumColor(spectrumOf(i.name)),
            } as React.CSSProperties
          }
        >
          <b>{i.name}</b>
          {i.kind && <span>{i.kind}</span>}
        </li>
      ))}
    </ul>
  );
}

export type NeedStatus =
  "met" | "unmet" | "unknown" | "unavailable" | "pending";
const GLYPH: Record<NeedStatus, string> = {
  met: "✓",
  unmet: "✕",
  unknown: "?",
  unavailable: "‖",
  pending: "·",
};
const WORD: Record<NeedStatus, string> = {
  met: "Works",
  unmet: "Doesn't work",
  unknown: "Not confirmed",
  unavailable: "Couldn't check",
  pending: "Not checked yet",
};
export function NeedChip({
  label,
  status,
  detail,
}: {
  label: string;
  status: NeedStatus;
  detail?: string;
}) {
  return (
    <span className="tp-need" data-status={status}>
      <i data-g={GLYPH[status]} aria-hidden="true" />
      <span>
        {label}
        {detail ? <small> · {detail}</small> : null}
      </span>
      <small>
        <span className="tp-sr" style={sr}>
          {WORD[status]}
        </span>
      </small>
    </span>
  );
}
export function NeedChips({ children }: { children: React.ReactNode }) {
  return (
    <ul className="tp-needs" aria-label="What matters right now">
      {Array.isArray(children) ? (
        children.map((c, i) => <li key={i}>{c}</li>)
      ) : (
        <li>{children}</li>
      )}
    </ul>
  );
}
const sr: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
};

// "How far AI may go". Read-only unless onChange is given, in which case it is
// a radio group, so the same component is the explanation and the control.
export function AuthorityLadder({
  ceiling,
  requested,
  onChange,
  name = "ceiling",
  developerTerms = false,
}: {
  ceiling: SubjectiveAction;
  requested?: SubjectiveAction;
  onChange?: (a: SubjectiveAction) => void;
  name?: string;
  developerTerms?: boolean;
}) {
  const level = SUBJECTIVE_ACTIONS.indexOf(ceiling);
  return (
    <ol className="tp-ladder" aria-label="How far AI may go">
      {SUBJECTIVE_ACTIONS.map((a, i) => {
        const asked = requested === a && i > level;
        return (
          <li
            key={a}
            className="tp-rung"
            data-reach={i <= level ? "yes" : "no"}
            data-asked={asked}
          >
            {onChange && (
              <input
                className="tp-ladder-input"
                type="radio"
                name={name}
                value={a}
                checked={a === ceiling}
                onChange={() => onChange(a)}
                aria-label={`${ACTION_HUMAN[a].label}: ${ACTION_HUMAN[a].detail}`}
              />
            )}
            <b>
              {ACTION_HUMAN[a].label}
              {developerTerms && <small> · {a}</small>}
            </b>
            <small>{ACTION_HUMAN[a].detail}</small>
            {i <= level && i === level && <em>Your limit</em>}
            {asked && <em>Asked for — needs your OK</em>}
          </li>
        );
      })}
    </ol>
  );
}

export function DecisionSeal({
  outcome,
  headline,
  children,
}: {
  outcome: Outcome;
  headline?: string;
  children?: React.ReactNode;
}) {
  const h = OUTCOME_HUMAN[outcome];
  return (
    <div className="tp-seal" data-outcome={outcome} role="status">
      <span className="tp-seal-mark" aria-hidden="true">
        {h.glyph}
      </span>
      <h3>{headline ?? h.label}</h3>
      <p>{children ?? h.line}</p>
    </div>
  );
}

// Source separation, shown in plain words.
export function SourceNote({
  kind,
  source,
  children,
}: {
  kind: string;
  source: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="tp-source">
      <b>{kind}</b>
      <span>
        {children}{" "}
        <em style={{ color: "var(--tp-muted)" }}>Source: {source}</em>
      </span>
    </div>
  );
}
