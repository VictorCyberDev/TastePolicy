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
  const tokens = new Set(words(haystack));
  const distinctive = nameWords.filter((word) => tokens.has(word)).length;
  const location = addressWords.filter((word) => tokens.has(word)).length;
  // All distinctive name tokens must match; one common word is not identity.
  if (!nameWords.length || distinctive !== nameWords.length) return -1;
  if (
    nameWords.length < 2 &&
    (nameWords[0].length < 5 ||
      location === 0 ||
      !haystack.includes(name.toLocaleLowerCase().normalize("NFKD")))
  )
    return -1;
  return distinctive * 3 + location;
}

function acceptedLicense(page: CommonsPage) {
  const license = plainText(metadata(page, "LicenseShortName"));
  const licenseUrl = text(metadata(page, "LicenseUrl"));
  const match = /^(CC BY(?:-SA)?) (1\.0|2\.0|2\.5|3\.0|4\.0)$/i.exec(license);
  const expected = match
    ? `https://creativecommons.org/licenses/${match[1].toLowerCase().replace("cc ", "")}/${match[2]}/`
    : /^(CC0|CC0 1\.0)$/i.test(license)
      ? "https://creativecommons.org/publicdomain/zero/1.0/"
      : /^Public domain$/i.test(license)
        ? "https://creativecommons.org/publicdomain/mark/1.0/"
        : null;
  if (
    !expected ||
    licenseUrl.replace(/\/$/, "") !== expected.replace(/\/$/, "")
  )
    return null;
  return { license, licenseUrl: expected };
}

function safeUrl(value: string, host: string, prefix: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === host &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.search &&
      !url.hash &&
      url.pathname.startsWith(prefix)
    );
  } catch {
    return false;
  }
}

const unavailable = {
  status: "unavailable",
  source: "wikimedia-commons",
  presentationOnly: true,
  classification: "UNAVAILABLE",
} as const;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const name = (searchParams.get("name") ?? "").trim();
  const address = (searchParams.get("address") ?? "").trim();

  if (!name || name.length > 250 || address.length > 300) {
    return Response.json(unavailable, { status: 400 });
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
      redirect: "error",
      next: { revalidate: 86400 },
    });
    if (!response.ok) throw new Error("commons_unavailable");
    const payload = (await response.json()) as {
      query?: { pages?: Record<string, CommonsPage> };
    };
    const pages = Object.values(payload.query?.pages ?? {})
      .slice(0, 8)
      .filter((page) => page && typeof page === "object");
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
    const rawImageUrl = info ? text(info.thumburl) || text(info.url) : "";
    // Commons currently adds first-party tracking parameters to thumbnail URLs.
    // Strip only known tracking keys; reject all other queries below.
    let imageUrl = rawImageUrl;
    try {
      const url = new URL(rawImageUrl);
      for (const key of ["utm_source", "utm_campaign", "utm_content"])
        url.searchParams.delete(key);
      imageUrl = url.href;
    } catch {
      /* The URL validator below fails closed. */
    }
    const landingUrl = info ? text(info.descriptionurl) : "";
    if (
      !selected ||
      !selected.license ||
      !(
        safeUrl(imageUrl, "upload.wikimedia.org", "/wikipedia/commons/") ||
        safeUrl(imageUrl, "thumb.wikimedia.org", "/wikipedia/commons/")
      ) ||
      !safeUrl(landingUrl, "commons.wikimedia.org", "/wiki/File:") ||
      !plainText(metadata(selected.page, "Artist"))
    ) {
      return Response.json(
        { ...unavailable, searchQuery: query },
        { headers: { "Cache-Control": "public, s-maxage=3600" } },
      );
    }

    return Response.json(
      {
        status: "available",
        source: "wikimedia-commons",
        presentationOnly: true,
        classification: "LOCATION_CONTEXT",
        searchQuery: query,
        caption: "Licensed visual context — exact property not verified",
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
      { ...unavailable, searchQuery: query },
      { headers: { "Cache-Control": "public, s-maxage=900" } },
    );
  }
}
