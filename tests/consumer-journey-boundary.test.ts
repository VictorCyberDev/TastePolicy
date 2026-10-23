import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import {
  TASTE_IMAGE_LABEL,
  portraitSeed,
  tasteImageSrc,
} from "@/features/arena/portrait";

const dir = join(process.cwd(), "src/features/arena");
const sources = [
  "ConsumerArena.tsx",
  "ConsumerStages.tsx",
  "ConsumerAuthorization.tsx",
  "useConsumerAuthorization.ts",
  "portrait.ts",
  "Boundary.tsx",
].map((file) => ({ file, text: readFileSync(join(dir, file), "utf8") }));

it("the consumer journey only reaches accepted authorization, discovery and presentation routes", () => {
  const paths = new Set(
    sources.flatMap(({ text }) => text.match(/"\/api\/[a-z/]+"/g) ?? []),
  );
  expect([...paths].sort()).toEqual([
    '"/api/demo/discover"',
    '"/api/demo/resolve"',
    '"/api/state/evaluate"',
    '"/api/state/interactive/answer"',
    '"/api/state/interactive/plan"',
    '"/api/state/interactive/repair"',
    '"/api/state/mutate"',
    '"/api/state/read"',
    '"/api/state/session"',
  ]);
});

it("the consumer journey contains no booking, reservation, payment or OTA execution surface", () => {
  for (const { file, text } of sources)
    expect(text, file).not.toMatch(
      /booking\.com|expedia|stripe|paypal|checkout|card number|cvc|cvv|type="date"|createBooking|reserveRoom|chargeCard/i,
    );
});

it("taste portraits are deterministic, labelled presentation only and never empty", () => {
  expect(TASTE_IMAGE_LABEL).toBe(
    "Illustrative taste image · not property photography",
  );
  const id = "10000000-0000-4000-8000-000000000006";
  expect(portraitSeed(id)).toEqual(portraitSeed(id));
  const palettes = new Set(
    Array.from(
      { length: 60 },
      (_, index) => portraitSeed(`candidate-${index}`).palette,
    ),
  );
  expect(palettes.size).toBeGreaterThan(3);
  for (const seed of [portraitSeed(id), portraitSeed("")]) {
    expect(seed.palette).toBeGreaterThanOrEqual(0);
    expect(seed.palette).toBeLessThan(8);
  }
});

it("every candidate resolves to a real authored image asset", () => {
  for (let index = 0; index < 8; index++)
    expect(
      existsSync(join(process.cwd(), "public/taste", `taste-${index}.svg`)),
    ).toBe(true);
  for (const id of ["a", "10000000-0000-4000-8000-000000000006", ""]) {
    const src = tasteImageSrc(id);
    expect(src).toMatch(/^\/taste\/taste-[0-7]\.svg$/);
    expect(existsSync(join(process.cwd(), "public", src))).toBe(true);
  }
});

it("portrait presentation never references authorization evidence inputs", () => {
  const text = sources.find((s) => s.file === "portrait.ts")!.text;
  expect(text).not.toMatch(/evaluate|StateEvaluation|authorization\(|policy/);
});
