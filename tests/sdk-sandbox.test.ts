// @vitest-environment node
import { it, expect } from "vitest";
import { TastePolicyClient, TastePolicyError } from "@/sdk/index";
import { createSandbox, SANDBOX_PASSPORTS } from "@/sdk/sandbox";
import { proposal } from "./interactive-fixtures";

const setup = () => {
  const sb = createSandbox();
  return new TastePolicyClient(sb.origin, sb.credential, { fetch: sb.fetch });
};
const propose = (name: string, version = 1) => {
  const p = proposal(1);
  return {
    ...p,
    expectedStateVersion: version,
    candidate: { ...p.candidate, name },
  };
};
for (const [scenario, permitted] of [
  ["ALLOW", "recommend"],
  ["ASK", "request_clarification"],
  ["REJECT", "do_not_proceed"],
  ["UNAVAILABLE", "do_not_assume_negative_preference"],
] as const)
  it(`sandbox scenario ${scenario} is deterministic and carries the right continuation`, async () => {
    const c = setup(),
      r = await c.evaluate({
        passportRef: SANDBOX_PASSPORTS.own,
        idempotencyKey: "sandbox-" + scenario,
        proposal: propose("Sandbox " + scenario),
      });
    expect(r.decision).toBe(scenario);
    expect(JSON.stringify(r.continuation)).toContain(permitted);
    expect((await c.status(r.receiptRef)).decision).toBe(scenario);
  });
it("sandbox reproduces grant, version, idempotency and credential failures as typed errors", async () => {
  const c = setup();
  const code = async (p: Promise<unknown>) =>
    p.then(
      () => "OK",
      (e: TastePolicyError) => `${e.code}:${e.status}:${e.retryable}`,
    );
  expect(
    await code(c.passport({ passportRef: SANDBOX_PASSPORTS.expiredGrant })),
  ).toBe("GRANT_EXPIRED:403:false");
  expect(
    await code(c.passport({ passportRef: SANDBOX_PASSPORTS.revokedGrant })),
  ).toBe("GRANT_REVOKED:403:false");
  expect(
    await code(
      c.evaluate({
        passportRef: SANDBOX_PASSPORTS.own,
        idempotencyKey: "v",
        proposal: propose("Sandbox Allow", 9),
      }),
    ),
  ).toBe("STATE_VERSION_CONFLICT:409:false");
  await c.evaluate({
    passportRef: SANDBOX_PASSPORTS.own,
    idempotencyKey: "same",
    proposal: propose("Sandbox Allow"),
  });
  expect(
    await code(
      c.evaluate({
        passportRef: SANDBOX_PASSPORTS.own,
        idempotencyKey: "same",
        proposal: propose("Sandbox Reject"),
      }),
    ),
  ).toBe("IDEMPOTENCY_KEY_CONFLICT:409:false");
  const sb = createSandbox();
  const wrong = new TastePolicyClient(
    sb.origin,
    `tp_live_${crypto.randomUUID()}.${"x".repeat(43)}`,
    { fetch: sb.fetch },
  );
  expect(await code(wrong.capabilities())).toBe("AUTH_REQUIRED:401:false");
});

it("SDK retryable set matches the shared error catalog", async () => {
  const { ERROR_CATALOG } = await import("@/lib/platform/errors");
  const sdk = await import("node:fs").then((f) =>
    f.readFileSync("src/sdk/index.ts", "utf8"),
  );
  const listed = [...sdk.matchAll(/^\s+"([A-Z_]+)",$/gm)].map((m) => m[1]);
  const expected = Object.entries(ERROR_CATALOG)
    .filter(([, v]) => v.retryable)
    .map(([k]) => k);
  expect(listed.sort()).toEqual(expected.sort());
});
