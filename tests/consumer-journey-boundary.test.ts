import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import {
  monogram,
  PORTRAIT_LABEL,
  portraitSeed,
} from "@/features/arena/portrait";

const dir = join(process.cwd(), "src/features/arena");
const sources = [
  "ConsumerArena.tsx",
  "ConsumerStages.tsx",
  "ConsumerAuthorization.tsx",
  "useConsumerAuthorization.ts",
  "portrait.ts",
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
  expect(PORTRAIT_LABEL).toBe("Taste portrait · presentation only");
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
    expect(seed.palette).toBeLessThan(6);
  }
  expect(monogram("  quiet hotel")).toBe("Q");
  expect(monogram("Hotel Cycle")).toBe("H");
  expect(monogram("")).toBe("·");
});

it("portrait presentation never references authorization evidence inputs", () => {
  const text = sources.find((s) => s.file === "portrait.ts")!.text;
  expect(text).not.toMatch(/evaluate|StateEvaluation|authorization\(|policy/);
});
