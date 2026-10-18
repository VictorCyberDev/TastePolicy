// @vitest-environment node
import { it, expect, vi } from "vitest";
import { handleSubjects } from "@/server/subjects/http";
import type { StateStore, Repositories } from "@/server/state/repositories";
const request = (body: unknown = {}, headers: Record<string, string> = {}) =>
  new Request("https://tastepolicy.test/api/state/subjects/proxy/create", {
    method: "POST",
    headers: {
      origin: "https://tastepolicy.test",
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
it("M5 persistence absence is explicit and constructs no provider", async () => {
  const factory = vi.fn();
  const r = await handleSubjects(request(), "proxy", "create", null, factory);
  expect(r.status).toBe(503);
  expect(await r.json()).toMatchObject({
    reason: "persistence_not_configured",
  });
  expect(factory).not.toHaveBeenCalled();
});
it("M5 denies cross-origin writes before database access", async () => {
  const r = await handleSubjects(
    request({}, { origin: "https://attacker.test" }),
    "group",
    "authorize",
    null,
    vi.fn(),
  );
  expect(r.status).toBe(403);
});
it("M5 rejects non-JSON and unknown routes", async () => {
  expect(
    (
      await handleSubjects(
        request({}, { "content-type": "text/plain" }),
        "proxy",
        "create",
        null,
        vi.fn(),
      )
    ).status,
  ).toBe(415);
  expect(
    (await handleSubjects(request(), "proxy", "raw", null, vi.fn())).status,
  ).toBe(404);
});
it("M5 invalid credentials fail safely without provider or stack", async () => {
  const store = {
      transaction: async (fn) => fn({} as Repositories),
    } as StateStore,
    r = await handleSubjects(request(), "proxy", "inspect", store, () => {
      throw Error("secret");
    });
  expect(r.status).toBe(401);
  expect(await r.json()).toMatchObject({ code: "SESSION_EXPIRED" });
});
it("M5 request bodies are bounded before service invocation", async () => {
  const r = await handleSubjects(
    request({ label: "x".repeat(20_000) }),
    "proxy",
    "create",
    {} as StateStore,
    vi.fn(),
  );
  expect(r.status).toBe(413);
});
