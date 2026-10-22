type MetadataField = { value?: unknown };

type CommonsPage = {
  title?: unknown;
  imageinfo?: Array<{
    url?: unknown;
    thumburl?: unknown;
    descriptionurl?: unknown;
    extmetadata?: Record<string, MetadataField>;
  }>;
};

const STOP_WORDS = new Set([
  "the",
  "of",
  "and",
  "hotel",
  "house",
  "guest",
  "villa",
  "beach",
  "rome",
  "japan",
]);

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function words(value: string) {
  return value
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

function plainText(value: unknown) {
  return text(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function metadata(page: CommonsPage, key: string) {
  return page.imageinfo?.[0]?.extmetadata?.[key]?.value;
}

function searchableText(page: CommonsPage) {
  return [
    text(page.title),
    plainText(metadata(page, "ObjectName")),
    plainText(metadata(page, "ImageDescription")),
    plainText(metadata(page, "Categories")),
  ]
    .join(" ")
    .toLocaleLowerCase()
    .normalize("NFKD");
}

function relevance(page: CommonsPage, name: string, address: string) {
  const haystack = searchableText(page);
  const nameWords = words(name);
  const addressWords = words(address).slice(-5);
  const distinctive = nameWords.filter((word) =>
    haystack.includes(word),
  ).length;
  const location = addressWords.filter((word) =>
    haystack.includes(word),
  ).length;
  const required = Math.min(2, Math.max(1, nameWords.length));
  if (distinctive < required) return -1;
  return distinctive * 3 + location;
}

function acceptedLicense(page: CommonsPage) {
  const license = plainText(metadata(page, "LicenseShortName"));
  const licenseUrl = text(metadata(page, "LicenseUrl"));
  const normalized = license.toLocaleLowerCase();
  const accepted =
    normalized.startsWith("cc by") ||
    normalized === "cc0" ||
    normalized.includes("public domain");
  return accepted && licenseUrl ? { license, licenseUrl } : null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const name = (searchParams.get("name") ?? "").trim();
  const address = (searchParams.get("address") ?? "").trim();

  if (!name || name.length > 250 || address.length > 300) {
    return Response.json({ status: "unavailable" }, { status: 400 });
  }

  const endpoint = new URL("https://commons.wikimedia.org/w/api.php");
  const query = [name, address].filter(Boolean).join(" ");
  const params = {
    action: "query",
    generator: "search",
    gsrsearch: query,
    gsrnamespace: "6",
    gsrlimit: "8",
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: "1400",
    format: "json",
    origin: "*",
  };
  for (const [key, value] of Object.entries(params)) {
    endpoint.searchParams.set(key, value);
  }

  try {
    const response = await fetch(endpoint, {
      headers: { "User-Agent": "TastePolicy/1.0 (candidate presentation)" },
      signal: AbortSignal.timeout(4500),
      next: { revalidate: 86400 },
    });
    if (!response.ok) throw new Error("commons_unavailable");
    const payload = (await response.json()) as {
      query?: { pages?: Record<string, CommonsPage> };
    };
    const pages = Object.values(payload.query?.pages ?? {});
    const candidates = pages
      .map((page) => ({
        page,
        score: relevance(page, name, address),
        license: acceptedLicense(page),
      }))
      .filter(({ score, license }) => score >= 0 && Boolean(license))
      .sort((a, b) => b.score - a.score);
    const selected = candidates[0];
    const info = selected?.page.imageinfo?.[0];
    const imageUrl = info ? text(info.thumburl) || text(info.url) : "";
    const landingUrl = info ? text(info.descriptionurl) : "";
    if (!selected || !selected.license || !imageUrl || !landingUrl) {
      return Response.json(
        { status: "unavailable", source: "wikimedia-commons" },
        { headers: { "Cache-Control": "public, s-maxage=3600" } },
      );
    }

    return Response.json(
      {
        status: "available",
        source: "wikimedia-commons",
        image: {
          url: imageUrl,
          title:
            plainText(metadata(selected.page, "ObjectName")) ||
            text(selected.page.title).replace(/^File:/, ""),
          creator:
            plainText(metadata(selected.page, "Artist")) || "Unknown creator",
          license: selected.license.license,
          licenseUrl: selected.license.licenseUrl,
          landingUrl,
          provider: "Wikimedia Commons",
        },
      },
      {
        headers: {
          "Cache-Control":
            "public, s-maxage=86400, stale-while-revalidate=604800",
        },
      },
    );
  } catch {
    return Response.json(
      { status: "unavailable", source: "wikimedia-commons" },
      { headers: { "Cache-Control": "public, s-maxage=900" } },
    );
  }
}
