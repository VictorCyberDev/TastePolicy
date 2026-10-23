import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/media/place/route";

const page = () => ({
  title: "File:Hotel Cycle Onomichi.jpg",
  imageinfo: [
    {
      thumburl:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Hotel.jpg/1400px-Hotel.jpg",
      descriptionurl: "https://commons.wikimedia.org/wiki/File:Hotel.jpg",
      extmetadata: {
        ObjectName: { value: "Hotel Cycle Onomichi" },
        Artist: { value: '<a href="https://example.org">Photographer</a>' },
        LicenseShortName: { value: "CC BY-SA 4.0" },
        LicenseUrl: {
          value: "https://creativecommons.org/licenses/by-sa/4.0/",
        },
      },
    },
  ],
});
const request = (name = "HOTEL CYCLE", address = "Onomichi Japan") =>
  new Request(
    `https://tastepolicy.test/api/media/place?${new URLSearchParams({ name, address })}`,
  );
const mock = (p: unknown) =>
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ query: { pages: { 1: p } } })),
  );
afterEach(() => vi.unstubAllGlobals());

describe("presentation-only Wikimedia adapter", () => {
  it("preserves attribution, query and conservative context classification", async () => {
    mock(page());
    const result = await (await GET(request())).json();
    expect(result).toMatchObject({
      status: "available",
      source: "wikimedia-commons",
      presentationOnly: true,
      classification: "LOCATION_CONTEXT",
      searchQuery: '"HOTEL CYCLE"',
      image: {
        creator: "Photographer",
        license: "CC BY-SA 4.0",
        licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
        landingUrl: "https://commons.wikimedia.org/wiki/File:Hotel.jpg",
      },
    });
    expect(result.caption).toContain("exact property not verified");
    const options = vi.mocked(fetch).mock.calls[0][1];
    expect(options?.redirect).toBe("error");
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  });
  it("accepts observed thumbnail host and canonicalizes license/tracking URLs", async () => {
    const p = page();
    p.imageinfo[0].thumburl =
      "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/photo.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail";
    p.imageinfo[0].extmetadata.LicenseUrl.value =
      "https://creativecommons.org/licenses/by-sa/4.0";
    mock(p);
    const result = await (await GET(request())).json();
    expect(result.status).toBe("available");
    expect(result.image.url).toBe(
      "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/photo.jpg",
    );
    expect(result.image.licenseUrl).toBe(
      "https://creativecommons.org/licenses/by-sa/4.0/",
    );
  });
  it("searches the candidate phrase and uses the full postal address for local disambiguation", async () => {
    mock(page());
    const result = await (
      await GET(
        request(
          "HOTEL CYCLE",
          "5-11 Nishigoshocho Onomichi Hiroshima 722-0037 Japan",
        ),
      )
    ).json();
    expect(result.status).toBe("available");
    expect(
      new URL(String(vi.mocked(fetch).mock.calls[0][0])).searchParams.get(
        "gsrsearch",
      ),
    ).toBe('"HOTEL CYCLE"');
  });
  it.each([
    {},
    null,
    { imageinfo: "malformed" },
    { title: "File:Unrelated building" },
  ])("fails closed for missing or malformed data: %j", async (p) => {
    mock(p);
    expect(await (await GET(request())).json()).toMatchObject({
      status: "unavailable",
      presentationOnly: true,
      classification: "UNAVAILABLE",
    });
  });
  it("handles no results", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ query: { pages: {} } })),
    );
    expect((await (await GET(request())).json()).status).toBe("unavailable");
  });
  it.each(["timeout", "upstream", "json"])(
    "falls back on %s failure",
    async (kind) => {
      vi.stubGlobal(
        "fetch",
        kind === "timeout"
          ? vi
              .fn()
              .mockRejectedValue(new DOMException("timeout", "TimeoutError"))
          : vi
              .fn()
              .mockResolvedValue(
                kind === "upstream"
                  ? new Response("", { status: 503 })
                  : new Response("not json"),
              ),
      );
      expect((await (await GET(request())).json()).status).toBe("unavailable");
    },
  );
  it.each([
    "CC BY-NC 4.0",
    "CC BY-ND 4.0",
    "All rights reserved",
    "CC BY-SA anything",
  ])("rejects unaccepted license %s", async (license) => {
    const p = page();
    p.imageinfo[0].extmetadata.LicenseShortName.value = license;
    mock(p);
    expect((await (await GET(request())).json()).status).toBe("unavailable");
  });
  it.each([
    "http://upload.wikimedia.org/wikipedia/commons/a.jpg",
    "https://upload.wikimedia.org.evil.test/wikipedia/commons/a.jpg",
    "https://user:secret@upload.wikimedia.org/wikipedia/commons/a.jpg",
    "javascript:alert(1)",
    "https://127.0.0.1/a.jpg",
  ])("rejects unsafe image URL %s", async (url) => {
    const p = page();
    p.imageinfo[0].thumburl = url;
    mock(p);
    expect((await (await GET(request())).json()).status).toBe("unavailable");
  });
  it("rejects unsafe landing and mismatched license links", async () => {
    const p = page();
    p.imageinfo[0].descriptionurl = "https://evil.test/photo";
    mock(p);
    expect((await (await GET(request())).json()).status).toBe("unavailable");
    const other = page();
    other.imageinfo[0].extmetadata.LicenseUrl.value =
      "https://evil.test/license";
    mock(other);
    expect((await (await GET(request())).json()).status).toBe("unavailable");
  });
  it("does not match a common substring or single ambiguous name", async () => {
    mock(page());
    expect((await (await GET(request("Cycle", ""))).json()).status).toBe(
      "unavailable",
    );
    expect((await (await GET(request("Cycl", "Onomichi"))).json()).status).toBe(
      "unavailable",
    );
  });
  it("rejects unbounded or missing input without upstream work", async () => {
    mock(page());
    expect((await GET(request(""))).status).toBe(400);
    expect((await GET(request("x".repeat(251)))).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
});
