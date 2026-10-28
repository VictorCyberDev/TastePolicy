// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { configuredOrigin } from "@/lib/config/origin";
import { publicOrigin } from "@/server/platform/origin";
import { GET } from "@/app/.well-known/openai-apps-challenge/route";
afterEach(() => vi.unstubAllEnvs());
it("rejects mixed production identities and unsafe issuer URLs", () => {
  for (const bad of [
    "https://a.test/path",
    "https://u:p@a.test",
    "https://a.test?x=1",
    "https://a.test#x",
    "http://a.test",
    "javascript:alert(1)",
  ]) {
    expect(configuredOrigin({ TASTEPOLICY_PUBLIC_ORIGIN: bad })).toBeNull();
  }
  expect(
    configuredOrigin({
      TASTEPOLICY_PUBLIC_ORIGIN: "https://a.test",
      BETTER_AUTH_URL: "https://b.test",
    }),
  ).toBeNull();
  expect(
    configuredOrigin({
      TASTEPOLICY_PUBLIC_ORIGIN: "https://a.test/",
      BETTER_AUTH_URL: "https://a.test",
      NEXT_PUBLIC_APP_URL: "https://a.test",
    }),
  ).toBe("https://a.test");
});
it("pins discovery despite a different request host", () => {
  vi.stubEnv("TASTEPOLICY_PUBLIC_ORIGIN", "https://tastepolicy.vercel.app");
  vi.stubEnv("BETTER_AUTH_URL", "https://tastepolicy.vercel.app");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://tastepolicy.vercel.app");
  expect(publicOrigin(new Request("https://attacker.test/"))).toBe(
    "https://tastepolicy.vercel.app",
  );
});
it("serves only the exact operator-supplied OpenAI challenge, with no cached draft", async () => {
  vi.stubEnv("OPENAI_APPS_CHALLENGE", "");
  expect(GET().status).toBe(404);
  vi.stubEnv("OPENAI_APPS_CHALLENGE", "test-challenge-only");
  const r = GET();
  expect(r.status).toBe(200);
  expect(await r.text()).toBe("test-challenge-only");
  expect(r.headers.get("cache-control")).toBe("no-store");
  vi.stubEnv("OPENAI_APPS_CHALLENGE", "bad\ntoken");
  expect(GET().status).toBe(404);
});
