import type { CandidateFact } from "@/lib/requirements/types";
import { cached, getJson } from "./http";
import type { OsmRef, ProviderOutcome } from "./types";

// Explicit OpenStreetMap tags become candidate facts. A missing tag is NOT a
// "no": it simply produces no fact, and the requirement stays unknown.
const NOTE =
  "Mapped by OpenStreetMap contributors; not independently verified.";
const fact = (
  key: string,
  value: boolean | string,
  now: string,
  note = NOTE,
): CandidateFact => ({
  key,
  value,
  state: "known",
  evidence: "VERIFIED",
  source: "openstreetmap",
  sourceType: "PLACE_PROVIDER",
  observedAt: now,
  note,
});

export function factsFromTags(
  tags: Record<string, string> | undefined,
  now: string,
): { facts: CandidateFact[]; silentKeys: string[] } {
  const facts: CandidateFact[] = [];
  const silent: string[] = [];
  const t = tags ?? {};
  switch (t.wheelchair) {
    case "yes":
      facts.push(fact("accessible_entrance", true, now));
      break;
    case "no":
      facts.push(fact("accessible_entrance", false, now));
      break;
    default:
      // "limited" means partly accessible: not enough to satisfy a step-free
      // requirement and not a refusal either, so it stays unknown.
      silent.push("accessible_entrance");
  }
  if (t["toilets:wheelchair"] === "yes")
    facts.push(fact("accessible_restroom", true, now));
  else if (t["toilets:wheelchair"] === "no")
    facts.push(fact("accessible_restroom", false, now));
  return { facts, silentKeys: silent };
}

const HOSTS = ["overpass-api.de", "overpass.private.coffee", "overpass.osm.jp"];
interface OverpassBody {
  elements?: { type?: string; id?: number; tags?: Record<string, string> }[];
}
// Fresher than Nominatim's extratags, bounded to a single element by id.
export async function overpassTags(
  ref: OsmRef,
  fetcher?: typeof fetch,
): Promise<ProviderOutcome<Record<string, string>>> {
  if (
    !/^(node|way|relation)$/.test(ref.type) ||
    !Number.isInteger(ref.id) ||
    ref.id <= 0
  )
    return { status: "unavailable", reason: "invalid_response" };
  const query = `[out:json][timeout:6];${ref.type}(${ref.id});out tags 1;`;
  return cached(`overpass:${ref.type}/${ref.id}`, 3_600_000, async () => {
    let last: ProviderOutcome<Record<string, string>> = {
      status: "unavailable",
      reason: "provider_error",
    };
    for (const host of HOSTS.slice(0, 1)) {
      const r = await getJson<OverpassBody>(
        `https://${host}/api/interpreter?${new URLSearchParams({ data: query })}`,
        { allowHosts: HOSTS, timeoutMs: 3500, fetcher, maxBytes: 100_000 },
      );
      if (r.status === "available") {
        const el = r.data.elements?.[0];
        if (!el?.tags || typeof el.tags !== "object")
          return { status: "unavailable", reason: "invalid_response" };
        return { status: "available", data: el.tags };
      }
      last = r;
    }
    return last;
  });
}
