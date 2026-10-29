// Live validation of the M25 open providers against real network services.
// Prints what each source actually returned for a candidate. Never fakes data.
import { resolveOpenPlace } from "@/server/open/context";

const candidates = [
  {
    name: "The Algonquin Hotel Times Square, Autograph Collection",
    address: "59 W 44th St New York, NY 10036",
    type: "place" as const,
  },
  {
    name: "Melody’s Piano Bar",
    address: "1020 Lexington Ave New York, NY 10021",
    type: "place" as const,
  },
];
const origin = { lat: 40.7359, lng: -73.9911, label: "Demo origin" };
for (const entity of candidates) {
  const t0 = Date.now();
  const c = await resolveOpenPlace(
    { entity, origin },
    {
      now: new Date().toISOString(),
      heigitKey: process.env.HEIGIT_API_KEY,
      mapillaryToken: process.env.MAPILLARY_ACCESS_TOKEN,
    },
  );
  const o = c.open;
  console.log(
    JSON.stringify(
      {
        candidate: entity.name,
        ms: Date.now() - t0,
        identity: {
          status: o.identity.status,
          confidence: o.identity.confidence,
          osm: o.identity.osm,
          loc: o.identity.location,
        },
        facts: c.facts.map((f) => `${f.key}=${f.value} (${f.source})`),
        silent: c.silentKeys,
        media: o.media.map(
          (m) =>
            `${m.relation}/${m.provider}/${m.capturedAt ?? "?"}/${m.distanceMeters ?? "-"}m${m.panoramic ? "/360" : ""}`,
        ),
        sequence: o.sequence
          ? { provider: o.sequence.provider, frames: o.sequence.frames.length }
          : null,
        panorama: Boolean(o.panorama),
        route: o.route
          ? { min: o.route.minutes, m: o.route.meters }
          : o.routeUnavailable,
        straightLineMeters: o.straightLineMeters,
        sources: o.sources.map(
          (s) => `${s.id}:${s.status}${s.detail ? "(" + s.detail + ")" : ""}`,
        ),
      },
      null,
      1,
    ),
  );
}
