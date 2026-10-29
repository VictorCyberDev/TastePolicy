import "./brand.css";

const SPECTRUM = [
  "var(--tp-vermilion)",
  "var(--tp-cobalt)",
  "var(--tp-violet)",
  "var(--tp-saffron)",
  "var(--tp-aqua)",
  "var(--tp-lime)",
  "var(--tp-rose)",
  "var(--tp-coral)",
];
export function hash(text: string) {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}
export const spectrumOf = (text: string) => hash(text) % SPECTRUM.length;
export const spectrumColor = (index: number) =>
  SPECTRUM[index % SPECTRUM.length];

// A person's recognisable visual identity, derived deterministically from the
// cultural anchors they explicitly chose. Presentation only: it is not a
// personality score, infers nothing about the person and is never evidence
// for an authorization decision.
export default function Tasteprint({
  anchors,
  size = 160,
  label,
}: {
  anchors: string[];
  size?: number;
  label?: string;
}) {
  const unique = [
    ...new Set(anchors.map((a) => a.trim()).filter(Boolean)),
  ].sort();
  const petals = unique.map((name, i) => {
    const h = hash(name);
    const angle = (h % 360) + i * 17;
    const length = 34 + (h % 13);
    const width = 11 + ((h >>> 4) % 9);
    return {
      name,
      angle,
      length,
      width,
      color: SPECTRUM[(h >>> 8) % SPECTRUM.length],
    };
  });
  return (
    <svg
      className="tp-tasteprint"
      role="img"
      aria-label={
        label ??
        `Tasteprint: a decorative pattern generated from ${unique.length} cultural anchors you chose. It is not a personality score and is not used to make decisions.`
      }
      viewBox="-50 -50 100 100"
      width={size}
      height={size}
    >
      <circle r="49" style={{ fill: "var(--tp-card, #fffdf8)" }} />
      {petals.map((p) => (
        <ellipse
          key={p.name}
          cx="0"
          cy={-p.length / 2}
          rx={p.width}
          ry={p.length / 2}
          style={{ fill: p.color }}
          opacity="0.82"
          transform={`rotate(${p.angle})`}
        />
      ))}
      <circle r="9" style={{ fill: "var(--tp-ink, #1c1b2e)" }} />
      <circle r="3.2" style={{ fill: "var(--tp-card, #fffdf8)" }} />
    </svg>
  );
}
