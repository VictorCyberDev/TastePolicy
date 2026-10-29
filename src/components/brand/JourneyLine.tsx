import "./brand.css";

// Decodes a Google encoded polyline. Pure and total: malformed input yields [].
export function decodePolyline(encoded: string): [number, number][] {
  const out: [number, number][] = [];
  let i = 0,
    lat = 0,
    lng = 0;
  while (i < encoded.length) {
    for (const axis of [0, 1]) {
      let shift = 0,
        result = 0,
        b: number;
      do {
        if (i >= encoded.length) return [];
        b = encoded.charCodeAt(i++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20 && shift < 35);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === 0) lat += delta;
      else lng += delta;
    }
    out.push([lat / 1e5, lng / 1e5]);
  }
  return out;
}

// A route is drawn only when a provider actually returned one. With no route
// the component says so; it never invents a path, a time or terrain.
export default function JourneyLine({
  polyline,
  minutes,
  meters,
  originLabel,
  destinationLabel,
  unavailableReason,
}: {
  polyline?: string;
  minutes?: number;
  meters?: number;
  originLabel?: string;
  destinationLabel: string;
  unavailableReason?: string;
}) {
  const pts = polyline ? decodePolyline(polyline) : [];
  if (pts.length < 2 || minutes === undefined)
    return (
      <div className="tp-journey">
        <p className="tp-source">
          <b>Journey</b>
          <span>
            Travel time to {destinationLabel} isn&apos;t confirmed
            {unavailableReason ? ` (${unavailableReason})` : ""}. No route is
            shown because none was provided.
          </span>
        </p>
      </div>
    );
  const lats = pts.map((p) => p[0]),
    lngs = pts.map((p) => p[1]);
  const [minLat, maxLat] = [Math.min(...lats), Math.max(...lats)];
  const [minLng, maxLng] = [Math.min(...lngs), Math.max(...lngs)];
  const w = 600,
    h = 240,
    pad = 28;
  const spanLat = maxLat - minLat || 1e-5,
    spanLng = maxLng - minLng || 1e-5;
  const scale = Math.min((w - 2 * pad) / spanLng, (h - 2 * pad) / spanLat);
  const x = (lng: number) => pad + (lng - minLng) * scale;
  const y = (lat: number) => h - pad - (lat - minLat) * scale;
  const d = pts
    .map(
      (p, i) => `${i ? "L" : "M"}${x(p[1]).toFixed(1)} ${y(p[0]).toFixed(1)}`,
    )
    .join("");
  const start = pts[0],
    end = pts[pts.length - 1];
  return (
    <div className="tp-journey">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label={`Walking route from ${originLabel ?? "your start"} to ${destinationLabel}: about ${minutes} minutes, ${meters ?? "?"} metres.`}
      >
        <path className="jl" pathLength="1" d={d} />
        <circle
          cx={x(start[1])}
          cy={y(start[0])}
          r="8"
          style={{ fill: "var(--tp-ink)" }}
        />
        <circle
          cx={x(end[1])}
          cy={y(end[0])}
          r="10"
          style={{ fill: "var(--tp-vermilion)" }}
          stroke="#fff"
          strokeWidth="3"
        />
      </svg>
      <p>
        <b>{minutes} min walk</b>
        {meters !== undefined
          ? ` · ${(meters / 1000).toFixed(1)} km`
          : ""} from {originLabel ?? "your start"}. Route time only: it says
        nothing about terrain, slopes or obstacles.
      </p>
    </div>
  );
}
