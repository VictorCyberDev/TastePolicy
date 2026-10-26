// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- assertions over loosely typed JSON responses */
import { beforeAll, afterAll, it, expect, vi } from "vitest";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import {
  platformDatabase,
  account,
  init,
  subjectProvider,
  future,
} from "./platform-fixtures";
import {
  LeaseService,
  isCommitmentAware,
  requirePresented,
} from "@/server/platform/lease-service";
import { handlePlatform } from "@/server/platform/http";
import { handleMcp } from "@/server/platform/mcp";
import { handleA2a, AUTHORITY_EXTENSION } from "@/server/platform/a2a";
import { TastePolicyClient, TastePolicyError } from "@/sdk/index";
import { proposal, reqId, commitOf } from "./interactive-fixtures";
import type { LeaseRecord } from "@/server/platform/lease-repository";

let d: Awaited<ReturnType<typeof platformDatabase>>;
let now = Date.now();
let svc: LeaseService;
const clock = () => new Date(now).toISOString();
const tick = (s: number) => (now += s * 1000);
beforeAll(async () => {
  d = await platformDatabase();
  svc = new LeaseService(d.store, clock);
}, 30000);
afterAll(async () => d?.db.close());

let n = 0;
const priced = (amount: number) =>
  proposal(1, {
    key: "trip",
    domain: "destination",
    price: { amount, currency: "USD" },
  });
async function world() {
  now = Date.now();
  const a = await account(d),
    q = subjectProvider(),
    passport = await svc.initialize(a.principal, init(), () => q.q);
  const key = await svc.issueKey(a.principal, {
    idempotencyKey: "k" + ++n,
    displayLabel: "SYNTHETIC TEST DATA",
    scopes: ["PASSPORT_READ", "TASTE_EVALUATE", "RECEIPT_READ"],
    expiresAt: future(),
  });
  const agent = await svc.credentialPrincipal(key.secret!);
  const evaluate = (p = priced(100)) =>
    svc.evaluate(
      agent,
      {
        idempotencyKey: "e" + ++n,
        passportRef: passport.passportRef,
        proposal: p,
      },
      () => q.q,
      reqId,
    ) as Promise<Record<string, any>>;
  const lease = async () => {
    const e = await evaluate();
    return (await svc.leaseRequest(agent, {
      idempotencyKey: "l" + ++n + "-key",
      evaluationRef: e.evaluationRef,
    })) as Record<string, any>;
  };
  return { a, q, passport, agent, secret: key.secret!, evaluate, lease };
}
const cand = (l: any) => ({
  candidateCommitment: commitOf(l).candidateCommitment,
});
const ctx = (l: any) => ({ contextCommitment: commitOf(l).contextCommitment });
const verify = (w: any, ref: string, extra: object = {}) =>
  svc.leaseVerify(w.agent, { leaseRef: ref, ...extra }) as Promise<any>;
const checkpoint = (w: any, ref: string, extra: object = {}) =>
  svc.leaseCheckpoint(w.agent, { leaseRef: ref, ...extra }) as Promise<any>;

it("1-3. verify without the candidate, without the context, or without either fails closed and names what is missing", async () => {
  const w = await world(),
    l = await w.lease();
  expect(l.commitmentRequired).toBe(true);
  await expect(verify(w, l.leaseRef)).rejects.toMatchObject({
    code: "COMMITMENT_REQUIRED",
    missing: ["candidate", "context"],
  });
  await expect(verify(w, l.leaseRef, cand(l))).rejects.toMatchObject({
    code: "COMMITMENT_REQUIRED",
    missing: ["context"],
  });
  await expect(verify(w, l.leaseRef, ctx(l))).rejects.toMatchObject({
    code: "COMMITMENT_REQUIRED",
    missing: ["candidate"],
  });
  // nothing was granted by the failed calls
  expect((await verify(w, l.leaseRef, commitOf(l))).valid).toBe(true);
}, 60000);
it("4-5. checkpoint with a partial or empty presentation is refused and does not extend the lease", async () => {
  const w = await world(),
    l = await w.lease();
  tick(10);
  for (const extra of [{}, cand(l), ctx(l)])
    await expect(checkpoint(w, l.leaseRef, extra)).rejects.toMatchObject({
      code: "COMMITMENT_REQUIRED",
    });
  const v = await verify(w, l.leaseRef, commitOf(l));
  expect([v.rev, v.checkpointDueAt]).toEqual([l.rev, l.checkpointDueAt]);
  const ok = await checkpoint(w, l.leaseRef, commitOf(l));
  expect(ok.rev).toBe(l.rev + 1);
}, 60000);
it("6-8. raw material, commitments, or one of each are all accepted; presenting both for one field is recomputed and confirmed", async () => {
  const w = await world(),
    l = await w.lease(),
    p = priced(100);
  expect(
    (
      await verify(w, l.leaseRef, {
        candidate: p.candidate,
        context: p.context,
      })
    ).valid,
  ).toBe(true);
  expect((await verify(w, l.leaseRef, commitOf(l))).valid).toBe(true);
  expect(
    (await verify(w, l.leaseRef, { candidate: p.candidate, ...ctx(l) })).valid,
  ).toBe(true);
  // material plus the commitment that agrees with it
  expect(
    (
      await verify(w, l.leaseRef, {
        candidate: p.candidate,
        context: p.context,
        ...commitOf(l),
      })
    ).valid,
  ).toBe(true);
  // material plus a commitment that does not agree with it is not accepted
  await expect(
    verify(w, l.leaseRef, {
      candidate: { ...p.candidate, name: "Another place" },
      context: p.context,
      ...cand(l),
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
}, 60000);
it("9-10. a changed candidate or situation, presented in full, suspends instead of passing", async () => {
  const w = await world(),
    l = await w.lease();
  const moved = await checkpoint(w, l.leaseRef, {
    ...cand(l),
    context: priced(450).context,
  });
  expect([moved.status, moved.valid, moved.reasons]).toEqual([
    "SUSPENDED",
    false,
    ["CONTEXT_CHANGED"],
  ]);
  const w2 = await world(),
    l2 = await w2.lease();
  const other = await verify(w2, l2.leaseRef, {
    ...ctx(l2),
    candidate: { ...priced(100).candidate, name: "Somewhere else" },
  });
  expect([other.status, other.reasons]).toEqual([
    "SUSPENDED",
    ["CANDIDATE_CHANGED"],
  ]);
}, 60000);
it("11-12. resume still needs a fresh ALLOW and the presentation: without it COMMITMENT_REQUIRED, with a different choice COMMITMENT_MISMATCH", async () => {
  const w = await world(),
    l = await w.lease();
  tick(5);
  await checkpoint(w, l.leaseRef, { ...cand(l), context: priced(450).context });
  tick(2);
  const fresh = await w.evaluate(priced(450));
  const resume = (extra: object) =>
    svc.leaseResume(w.agent, {
      idempotencyKey: "rs" + ++n + "-key",
      leaseRef: l.leaseRef,
      evaluationRef: fresh.evaluationRef,
      ...extra,
    }) as Promise<any>;
  await expect(resume({})).rejects.toMatchObject({
    code: "COMMITMENT_REQUIRED",
    missing: ["candidate", "context"],
  });
  await expect(resume(cand(l))).rejects.toMatchObject({
    code: "COMMITMENT_REQUIRED",
    missing: ["context"],
  });
  await expect(
    resume({ ...cand(l), contextCommitment: l.commitments.context }),
  ).rejects.toMatchObject({ code: "COMMITMENT_MISMATCH" });
  const back = await resume({
    ...cand(l),
    contextCommitment: fresh.commitments.context,
  });
  expect([back.status, back.valid]).toEqual(["ACTIVE", true]);
  expect(back.commitments).toEqual(fresh.commitments);
}, 60000);
it("13. a lease without commitments (issued before they existed) keeps the old behaviour by explicit version detection", () => {
  const legacy = {
    state: { fingerprint: { stateHash: "x" } },
  } as unknown as LeaseRecord;
  expect(isCommitmentAware(legacy)).toBe(false);
  expect(() => requirePresented(legacy, {})).not.toThrow();
  const modern = {
    state: {
      fingerprint: { candidateCommitment: "c", contextCommitment: "x" },
    },
  } as unknown as LeaseRecord;
  expect(isCommitmentAware(modern)).toBe(true);
  expect(() => requirePresented(modern, {})).toThrow();
  // half-formed fingerprints do not downgrade a lease to legacy
  const half = {
    state: { fingerprint: { candidateCommitment: "c" } },
  } as unknown as LeaseRecord;
  expect(isCommitmentAware(half)).toBe(false);
});
it("14. an ended lease reports its status without demanding a presentation; omission never turns a dead lease valid", async () => {
  const w = await world(),
    l = await w.lease();
  await svc.leaseRelease(w.agent, { leaseRef: l.leaseRef });
  const v = await verify(w, l.leaseRef);
  expect([v.status, v.valid, v.permittedActions]).toEqual([
    "RELEASED",
    false,
    [],
  ]);
}, 60000);
it("15. concurrent checkpoints: those that omit the presentation fail, those that present it succeed, and the revision count is exact", async () => {
  const w = await world(),
    l = await w.lease();
  const results = await Promise.allSettled([
    checkpoint(w, l.leaseRef, commitOf(l)),
    checkpoint(w, l.leaseRef, {}),
    checkpoint(w, l.leaseRef, commitOf(l)),
    checkpoint(w, l.leaseRef, cand(l)),
    checkpoint(w, l.leaseRef, commitOf(l)),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
  for (const r of results.filter((r) => r.status === "rejected"))
    expect((r as PromiseRejectedResult).reason.code).toBe(
      "COMMITMENT_REQUIRED",
    );
  expect((await verify(w, l.leaseRef, commitOf(l))).rev).toBe(l.rev + 3);
}, 60000);

// ---- the same contract on every door ----
function rest(w: Awaited<ReturnType<typeof world>>) {
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input, options) => {
      const r = new Request(input as URL, options);
      return handlePlatform(
        r,
        new URL(r.url).pathname.split("/").at(-1)!,
        "v1",
        d.store,
        () => w.q.q,
      );
    });
  return {
    client: new TastePolicyClient("https://tastepolicy.test", w.secret),
    done: () => fetcher.mockRestore(),
  };
}
it("16. REST and SDK: HTTP 428 with `missing`, surfaced as TastePolicyError.missing; presenting both works", async () => {
  const w = await world(),
    l = await w.lease();
  const { client, done } = rest(w);
  try {
    const err: TastePolicyError = await client
      .leaseVerify(l.leaseRef)
      .catch((e) => e);
    expect(err).toBeInstanceOf(TastePolicyError);
    expect([err.code, err.status, err.retryable, err.missing]).toEqual([
      "COMMITMENT_REQUIRED",
      428,
      false,
      ["candidate", "context"],
    ]);
    const half: TastePolicyError = await client
      .leaseCheckpoint(l.leaseRef, undefined, {
        candidateCommitment: l.commitments.candidate,
      })
      .catch((e) => e);
    expect(half.missing).toEqual(["context"]);
    const ok = await client.leaseVerify(l.leaseRef, {
      candidateCommitment: l.commitments.candidate,
      contextCommitment: l.commitments.context,
    });
    expect([ok.valid, ok.commitmentRequired]).toEqual([true, true]);
  } finally {
    done();
  }
}, 60000);
it("17. MCP and A2A carry the same typed failure and the missing list", async () => {
  const w = await world(),
    l = await w.lease();
  const deps = { store: d.store, factory: () => w.q.q };
  const client = new Client(
    { name: "synthetic-test-client", version: "1.0.0" },
    { versionNegotiation: { mode: "auto" } },
  );
  await client.connect(
    new StreamableHTTPClientTransport(
      new URL("https://tastepolicy.test/api/mcp"),
      {
        fetch: ((i: string | URL | Request, o?: RequestInit) =>
          handleMcp(new Request(i as URL, o), deps)) as typeof fetch,
        requestInit: { headers: { Authorization: `Bearer ${w.secret}` } },
      },
    ),
  );
  const res: any = await client.callTool({
    name: "tastepolicy_verify_lease",
    arguments: { leaseRef: l.leaseRef },
  });
  expect(res.structuredContent).toMatchObject({
    code: "COMMITMENT_REQUIRED",
    missing: ["candidate", "context"],
  });
  await client.close();
  const a2a: any = await (
    await handleA2a(
      new Request("https://tastepolicy.test/api/a2a", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${w.secret}`,
          "a2a-version": "1.0",
          "a2a-extensions": AUTHORITY_EXTENSION,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "SendMessage",
          params: {
            message: {
              messageId: "cr-msg-00001",
              role: "ROLE_USER",
              parts: [
                {
                  data: { operation: "lease.verify", leaseRef: l.leaseRef },
                  mediaType: "application/json",
                },
              ],
            },
          },
        }),
      }),
      deps,
    )
  ).json();
  expect(a2a.error.data[0]).toMatchObject({
    reason: "COMMITMENT_REQUIRED",
    metadata: { missing: "candidate,context" },
  });
}, 60000);
