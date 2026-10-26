// @vitest-environment node
import { afterEach, it, expect } from "vitest";
import { clientKey } from "@/server/platform/client-key";
import { admitAuth } from "@/server/platform/auth-limit";

const req = (h: Record<string, string>) =>
  new Request("https://tastepolicy.test/x", { headers: h });
afterEach(() => {
  delete process.env.VERCEL;
  delete process.env.TASTEPOLICY_TRUSTED_IP_HEADER;
});
it("off Vercel, client-chosen identity headers are ignored: rotating them does not get a fresh bucket", () => {
  const a = clientKey(req({ "x-real-ip": "1.1.1.1" })),
    b = clientKey(
      req({ "x-real-ip": "2.2.2.2", "x-forwarded-for": "3.3.3.3" }),
    );
  expect([a, b]).toEqual(["unknown", "unknown"]);
});
it("on Vercel the platform headers are used; a named trusted proxy header is used elsewhere", () => {
  process.env.VERCEL = "1";
  expect(clientKey(req({ "x-vercel-forwarded-for": "9.9.9.9" }))).toBe(
    "9.9.9.9",
  );
  expect(clientKey(req({ "x-forwarded-for": "evil, 198.51.100.5" }))).toBe(
    "198.51.100.5",
  ); // last hop, not the client-chosen first
  delete process.env.VERCEL;
  process.env.TASTEPOLICY_TRUSTED_IP_HEADER = "x-proxy-client";
  expect(
    clientKey(req({ "x-proxy-client": "7.7.7.7", "x-real-ip": "1.1.1.1" })),
  ).toBe("7.7.7.7");
  process.env.TASTEPOLICY_TRUSTED_IP_HEADER = "bad header!";
  expect(clientKey(req({ "x-real-ip": "1.1.1.1" }))).toBe("unknown");
});
it("sign-in admission is its own budget, per client, with a concurrency cap and idempotent release", () => {
  process.env.VERCEL = "1";
  const r = (ip: string) => req({ "x-real-ip": ip });
  const t = 50_000_000;
  const held = Array.from({ length: 6 }, (_, i) =>
    admitAuth(r(`10.1.0.${i}`), t)!,
  );
  expect(held.every(Boolean)).toBe(true);
  expect(admitAuth(r("10.1.0.99"), t)).toBeNull(); // 6 at once
  held[0]();
  held[0]();
  held.slice(1).forEach((h) => h());
  for (let i = 0; i < 20; i++) admitAuth(r("10.2.0.1"), t + i)!();
  expect(admitAuth(r("10.2.0.1"), t + 21)).toBeNull(); // 20 per minute per client
  expect(admitAuth(r("10.2.0.2"), t + 21)).toBeTruthy(); // other clients unaffected
});
