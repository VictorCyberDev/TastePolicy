import "./brand.css";

export type RibbonState =
  "discover" | "checking" | "ask" | "allow" | "reject" | "unavailable";
const LABEL: Record<RibbonState, string> = {
  discover: "Discovering what fits your taste",
  checking: "Checking your needs against the boundary",
  ask: "Paused at the boundary: waiting for your answer",
  allow: "Crossed the boundary, but only as far as you allowed",
  reject: "Stopped at the boundary: it breaks one of your needs",
  unavailable: "Could not check: evidence is unavailable",
};
const STATIONS = [
  { x: 70, name: "Taste" },
  { x: 280, name: "Context" },
  { x: 520, name: "Boundary" },
  { x: 760, name: "Decision" },
];

// Taste -> Context -> Boundary -> Decision. Motion is semantic: it flows while
// discovering, scans while checking, pauses on ASK, advances only to the
// permitted point on ALLOW, stops short on REJECT and fades on UNAVAILABLE.
// `reach` (0..1) is how far past the boundary the person allows AI to go.
export default function BoundaryRibbon({
  state,
  reach = 0.4,
  caption,
}: {
  state: RibbonState;
  reach?: number;
  caption?: string;
}) {
  const marker =
    state === "discover"
      ? 150
      : state === "checking"
        ? 280
        : state === "ask"
          ? 512
          : state === "reject"
            ? 498
            : state === "unavailable"
              ? 330
              : 520 + 240 * Math.min(1, Math.max(0, reach));
  const text = caption ?? LABEL[state];
  return (
    <figure style={{ margin: 0 }}>
      <svg
        className="tp-ribbon"
        data-state={state}
        viewBox="0 0 830 120"
        role="img"
        aria-label={`Boundary ribbon. ${text}.`}
      >
        <defs>
          <linearGradient
            id="tp-rb-grad"
            gradientUnits="userSpaceOnUse"
            x1="70"
            x2="760"
            y1="0"
            y2="0"
          >
            <stop offset="0" style={{ stopColor: "var(--tp-vermilion)" }} />
            <stop offset="0.3" style={{ stopColor: "var(--tp-saffron)" }} />
            <stop offset="0.55" style={{ stopColor: "var(--tp-aqua)" }} />
            <stop offset="0.8" style={{ stopColor: "var(--tp-cobalt)" }} />
            <stop offset="1" style={{ stopColor: "var(--tp-violet)" }} />
          </linearGradient>
        </defs>
        <line className="rb-track" x1="70" x2="760" y1="62" y2="62" />
        <line
          className="rb-flow"
          x1="70"
          x2={state === "reject" || state === "ask" ? 510 : 760}
          y1="62"
          y2="62"
          stroke="url(#tp-rb-grad)"
        />
        <line className="rb-line" x1="520" x2="520" y1="22" y2="102" />
        {STATIONS.map((s) => (
          <g key={s.name}>
            <circle cx={s.x} cy="62" r="5" style={{ fill: "var(--tp-ink)" }} />
            <text x={s.x} y="16" textAnchor="middle">
              {s.name}
            </text>
          </g>
        ))}
        {state === "checking" && (
          <g style={{ "--rb-span": "230px" } as React.CSSProperties}>
            <rect
              className="rb-scan"
              x="280"
              y="50"
              width="6"
              height="24"
              rx="3"
            />
          </g>
        )}
        <circle
          className="rb-marker rb-advance"
          cx="0"
          cy="62"
          r="11"
          style={{ transform: `translateX(${marker}px)` }}
        />
      </svg>
      <figcaption className="tp-visually-hidden" style={visuallyHidden}>
        {text}
      </figcaption>
    </figure>
  );
}
const visuallyHidden: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
};
