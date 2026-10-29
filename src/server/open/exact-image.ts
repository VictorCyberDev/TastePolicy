import {
  acceptedLicense,
  metadata,
  plainText,
  safeUrl,
  text,
  type CommonsPage,
} from "@/server/media/commons-license";
import { cached, getJson } from "./http";
import type { PlaceMediaItem, ProviderOutcome } from "./types";

// The only route to EXACT_POI: the map data itself links the place to an
// image (OSM `wikimedia_commons=File:…`, or the place's Wikidata item has an
// image, P18). Licensing is re-validated with the same rules as the legacy
// Wikimedia route. A name or a location is never enough.
const COMMONS = "https://commons.wikimedia.org/w/api.php";
export function commonsFileFor(
  tags: Record<string, string> | undefined,
  wikidataFile?: string,
): string | null {
  const direct = tags?.wikimedia_commons;
  if (typeof direct === "string" && /^File:[^|<>]{3,200}$/.test(direct))
    return direct;
  if (wikidataFile && /^[^|<>]{3,200}$/.test(wikidataFile))
    return `File:${wikidataFile}`;
  return null;
}
export async function wikidataImage(
  qid: string,
  fetcher?: typeof fetch,
): Promise<ProviderOutcome<string | null>> {
  if (!/^Q\d{1,12}$/.test(qid))
    return { status: "unavailable", reason: "invalid_response" };
  return cached(`wikidata:${qid}`, 24 * 3_600_000, async () => {
    const r = await getJson<{
      entities?: Record<
        string,
        {
          claims?: Record<
            string,
            { mainsnak?: { datavalue?: { value?: unknown } } }[]
          >;
        }
      >;
    }>(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`, {
      allowHosts: ["www.wikidata.org"],
      timeoutMs: 4500,
      fetcher,
      maxBytes: 3_000_000,
    });
    if (r.status !== "available") return r;
    const v =
      r.data.entities?.[qid]?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
    return { status: "available", data: typeof v === "string" ? v : null };
  });
}
export async function exactImage(
  file: string,
  fetcher?: typeof fetch,
): Promise<ProviderOutcome<PlaceMediaItem | null>> {
  return cached(`commons:${file}`, 24 * 3_600_000, async () => {
    const r = await getJson<{
      query?: { pages?: Record<string, CommonsPage> };
    }>(
      `${COMMONS}?${new URLSearchParams({
        action: "query",
        titles: file,
        prop: "imageinfo",
        iiprop: "url|extmetadata",
        iiurlwidth: "1280",
        format: "json",
        origin: "*",
      })}`,
      { allowHosts: ["commons.wikimedia.org"], timeoutMs: 4500, fetcher },
    );
    if (r.status !== "available") return r;
    const page = Object.values(r.data.query?.pages ?? {})[0];
    const info = page?.imageinfo?.[0];
    if (!page || !info) return { status: "available", data: null };
    const license = acceptedLicense(page);
    let image = text(info.thumburl) || text(info.url);
    try {
      const u = new URL(image);
      for (const k of ["utm_source", "utm_campaign", "utm_content"])
        u.searchParams.delete(k);
      image = u.href;
    } catch {
      /* validated below */
    }
    const landing = text(info.descriptionurl);
    const artist = plainText(metadata(page, "Artist"));
    if (
      !license ||
      !artist ||
      !(
        safeUrl(image, "upload.wikimedia.org", "/wikipedia/commons/") ||
        safeUrl(image, "thumb.wikimedia.org", "/wikipedia/commons/")
      ) ||
      !safeUrl(landing, "commons.wikimedia.org", "/wiki/File:")
    )
      return { status: "available", data: null };
    const taken = plainText(metadata(page, "DateTimeOriginal"));
    return {
      status: "available",
      data: {
        provider: "wikimedia-commons",
        providerId: file,
        mediaType: "photo",
        url: image,
        thumbUrl: image,
        landingUrl: landing,
        author: artist,
        attribution: `${artist} · Wikimedia Commons`,
        license: license.license,
        licenseUrl: license.licenseUrl,
        capturedAt: /^\d{4}-\d{2}-\d{2}/.test(taken)
          ? taken.slice(0, 10)
          : undefined,
        panoramic: false,
        relation: "EXACT_POI",
        confidence: 0.9,
      },
    };
  });
}
