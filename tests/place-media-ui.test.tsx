import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import PlaceMediaEnhancer from "@/features/arena/PlaceMediaEnhancer";

const media = {
  status: "available",
  source: "wikimedia-commons",
  presentationOnly: true,
  classification: "LOCATION_CONTEXT",
  searchQuery: "Hotel Cycle",
  caption: "Licensed visual context — exact property not verified",
  image: {
    url: "https://upload.wikimedia.org/wikipedia/commons/a/photo.jpg",
    title: "Context",
    creator: "Photographer",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    landingUrl: "https://commons.wikimedia.org/wiki/File:Photo.jpg",
  },
};
function mount() {
  return render(
    <>
      <div className="placeCard">
        <div className="placePortrait">
          <span>Taste portrait · presentation only</span>
        </div>
        <div className="placeContent">
          <h3>Hotel Cycle</h3>
        </div>
      </div>
      <PlaceMediaEnhancer />
    </>,
  );
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("shows credited context only after successful load and restores mood on image failure", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(media)));
  mount();
  const img = await screen.findByRole("img", { hidden: true });
  expect(document.querySelector(".hasLicensedPhoto")).toBeNull();
  fireEvent.load(img);
  expect(
    await screen.findByRole("link", { name: /Photographer/ }),
  ).toHaveAttribute("href", media.image.landingUrl);
  expect(screen.getByRole("link", { name: "CC BY 4.0" })).toHaveAttribute(
    "href",
    media.image.licenseUrl,
  );
  expect(document.querySelector(".hasLicensedPhoto")).not.toBeNull();
  fireEvent.error(img);
  await waitFor(() => expect(screen.queryByRole("img")).toBeNull());
  expect(document.querySelector(".hasLicensedPhoto")).toBeNull();
  expect(screen.getByText("Taste portrait · presentation only")).toBeVisible();
});
it("keeps mood artwork on no-result media", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ status: "unavailable" })),
  );
  mount();
  await waitFor(() => expect(fetch).toHaveBeenCalled());
  expect(screen.queryByRole("img")).toBeNull();
  expect(screen.getByText("Taste portrait · presentation only")).toBeVisible();
});
it("removes the old photo immediately when the candidate changes", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json(media))
    .mockImplementation(() => new Promise(() => {}));
  vi.stubGlobal("fetch", fetcher);
  mount();
  fireEvent.load(await screen.findByRole("img", { hidden: true }));
  document.querySelector("h3")!.textContent = "Another place";
  await waitFor(() => expect(screen.queryByRole("img")).toBeNull());
  expect(document.querySelector(".hasLicensedPhoto")).toBeNull();
});
