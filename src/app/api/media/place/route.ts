type OpenverseImage = {
  title?: unknown;
  creator?: unknown;
  creator_url?: unknown;
  license?: unknown;
  license_version?: unknown;
  thumbnail?: unknown;
  url?: unknown;
  foreign_landing_url?: unknown;
  source?: unknown;
  width?: unknown;
  height?: unknown;
  tags?: unknown;
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

function words(value: string) {
  return value
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function imageText(image: OpenverseImage) {
  const tags = Array.isArray(image.tags)
    ? image.tags
        .map((tag) =>
          typeof tag === "string"
            ? tag
            : tag && typeof tag === "object" && "name" in tag
              ? text((tag as { name?: unknown }).name)
              : "",
        )
        .join(" ")
    : "";
  return `${text(image.title)} ${tags}`.toLocaleLowerCase().normalize("NFKD");
}

function relevance(image: OpenverseImage, name: string, address: string) {
  const haystack = imageText(image);
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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const name = (searchParams.get("name") ?? "").trim();
  const address = (searchParams.get("address") ?? "").trim();

  if (!name || name.length > 250 || address.length > 300) {
    return Response.json({ status: "unavailable" }, { status: 400 });
  }

  const query = [name, address].filter(Boolean).join(" ");
  const endpoint = new URL("https://api.openverse.org/v1/images/");
  endpoint.searchParams.set("q", query);
  endpoint.searchParams.set("page_size", "8");
  endpoint.searchParams.set("license", "pdm,cc0,by,by-sa");
  endpoint.searchParams.set("mature", "false");

  try {
    const response = await fetch(endpoint, {
      headers: { "User-Agent": "TastePolicy/1.0 (candidate presentation)" },
      signal: AbortSignal.timeout(4500),
      next: { revalidate: 86400 },
    });
    if (!response.ok) throw new Error("openverse_unavailable");
    const payload = (await response.json()) as { results?: unknown };
    const candidates = Array.isArray(payload.results)
      ? (payload.results as OpenverseImage[])
          .map((image) => ({ image, score: relevance(image, name, address) }))
          .filter(({ score }) => score >= 0)
          .sort((a, b) => b.score - a.score)
      : [];
    const image = candidates[0]?.image;
    const imageUrl = image ? text(image.url) || text(image.thumbnail) : "";
    if (!image || !imageUrl || !text(image.foreign_landing_url)) {
      return Response.json(
        { status: "unavailable", source: "openverse" },
        { headers: { "Cache-Control": "public, s-maxage=3600" } },
      );
    }

    return Response.json(
      {
        status: "available",
        source: "openverse",
        image: {
          url: imageUrl,
          thumbnail: text(image.thumbnail),
          title: text(image.title),
          creator: text(image.creator) || "Unknown creator",
          creatorUrl: text(image.creator_url),
          license: text(image.license).toUpperCase(),
          licenseVersion: text(image.license_version),
          landingUrl: text(image.foreign_landing_url),
          provider: text(image.source) || "Openverse",
          width: typeof image.width === "number" ? image.width : null,
          height: typeof image.height === "number" ? image.height : null,
        },
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
        },
      },
    );
  } catch {
    return Response.json(
      { status: "unavailable", source: "openverse" },
      { headers: { "Cache-Control": "public, s-maxage=900" } },
    );
  }
}
