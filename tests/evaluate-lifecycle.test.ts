// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- assertions over loosely typed JSON responses */
// SYNTHETIC TEST DATA. The pooled test database serves one connection at a time, so a
// transaction held across the provider call would make the owner's concurrent writes hang.
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, it, expect } from "vitest";
import {
  platformDatabase,
  account,
  init,
  subjectProvider,
  future,
} from "./platform-fixtures";
import { PlatformService } from "@/server/platform/service";
import { stateHash } from "@/server/state/service";
import { proposal, reqId } from "./interactive-fixtures";
import type { QlooProvider } from "@/server/qloo/contracts";
import type { StateEntry } from "@/lib/state/types";

let d: Awaited<ReturnType<typeof platformDatabase>>;
let svc: PlatformService;
beforeAll(async () => {
  d = await platformDatabase();
  svc = new PlatformService(d.store);
}, 30000);
afterAll(async () => d?.db.close());

let n = 0;
// A provider whose evidence call waits until the test lets it finish.
function gated() {
  const base = subjectProvider();
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const inside = new Promise<void>((r) => (entered = r));
  const q: QlooProvider = {
    ...base.q,
    async infer(input) {
      entered();
      await gate;
      return base.q.infer(input);
    },
  };
  return { q, release, inside, base };
}
async function advanceState(ref: string) {
  await d.store.transaction(async (r) => {
    const passport = (await r.platform.passport(ref))!;
    const cur = (await r.states.version(
      passport.profileId,
      passport.stateVersion,
    ))!;
    const entry: StateEntry = {
      signalId: randomUUID(),
      kind: "CONSTRAINT",
      scope: "CONTEXT",
      persistence: "CONTEXT_SCOPED",
      contextKey: "trip",
      constraint: { kind: "MAX_PRICE", amount: 10, currency: "USD" },
      category: "TOO_EXPENSIVE",
      source: "USER",
      sourceEventId: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    const entries = [...cur.entries, entry],
      mutationId = randomUUID(),
      next = {
        ...cur,
        stateVersion: cur.stateVersion + 1,
        parentVersion: cur.stateVersion,
        mutationId,
        entries,
        stateHash: stateHash(entries),
        createdAt: new Date().toISOString(),
      };
    await r.states.insertVersion(next);
    await r.mutations.insert({
      profileId: passport.profileId,
      key: "t-" + mutationId,
      payloadHash: next.stateHash,
      result: { state: next, mutationId },
    });
    await r.states.advance(passport.profileId, next.stateVersion);
  });
}
async function world() {
  const owner = await account(d),
    q = subjectProvider();
  const passport: any = await svc.initialize(
    owner.principal,
    init(),
    () => q.q,
  );
  const key: any = await svc.issueKey(owner.principal, {
    idempotencyKey: "k" + ++n,
    displayLabel: "SYNTHETIC TEST DATA",
    scopes: ["PASSPORT_READ", "TASTE_EVALUATE", "RECEIPT_READ"],
    expiresAt: future(5 * 86_400_000),
  });
  return {
    owner,
    ref: passport.passportRef as string,
    agent: await svc.credentialPrincipal(key.secret),
  };
}
const evaluations = async (ref: string) =>
  (
    (
      await d.db.query(
        "SELECT count(*)::int AS n FROM tastepolicy.platform_evaluations WHERE passport_ref=$1",
        [ref],
      )
    ).rows[0] as { n: number }
  ).n;

it("the provider call holds no transaction: the owner can change state meanwhile, and the stale answer is rejected at commit", async () => {
  const w = await world(),
    g = gated();
  const pending = svc.evaluate(
    w.agent,
    {
      idempotencyKey: "ev" + ++n + "-key",
      passportRef: w.ref,
      proposal: proposal(1),
    },
    () => g.q,
    reqId,
  );
  const settled = pending.then(
    () => "ok",
    (e: any) => e.code,
  );
  await g.inside;
  // would hang forever if a transaction or lock were held across the provider call
  await advanceState(w.ref);
  g.release();
  expect(await settled).toBe("STATE_VERSION_CONFLICT");
  expect(await evaluations(w.ref)).toBe(0);
  // a fresh evaluation against the new state succeeds
  const fresh: any = await svc.evaluate(
    w.agent,
    {
      idempotencyKey: "ev" + ++n + "-key",
      passportRef: w.ref,
      proposal: proposal(2),
    },
    () => subjectProvider().q,
    reqId,
  );
  expect(fresh.stateVersion).toBe(2);
}, 60000);

it("a credential revoked during the provider call cannot commit the answer", async () => {
  const w = await world(),
    g = gated();
  const pending = svc.evaluate(
    w.agent,
    {
      idempotencyKey: "ev" + ++n + "-key",
      passportRef: w.ref,
      proposal: proposal(1),
    },
    () => g.q,
    reqId,
  );
  const settled = pending.then(
    () => "ok",
    (e: any) => e.code,
  );
  await g.inside;
  const cred = (await svc.inspect(w.owner.principal)).credentials[0];
  await svc.revokeKey(w.owner.principal, {
    idempotencyKey: "rk" + ++n + "-key",
    credentialId: cred.credentialId,
  });
  g.release();
  expect(await settled).toBe("CREDENTIAL_REVOKED");
  expect(await evaluations(w.ref)).toBe(0);
}, 60000);

it("passport creation does not hold the account while the provider resolves identities; replays skip the provider", async () => {
  const a = await account(d),
    base = subjectProvider(),
    input = init("create-" + ++n);
  const first: any = await svc.initialize(a.principal, input, () => base.q);
  let calls = 0;
  const counting: QlooProvider = {
    ...base.q,
    async entities(ids) {
      calls++;
      return base.q.entities(ids);
    },
  };
  const again: any = await svc.initialize(a.principal, input, () => counting);
  expect(again.passportRef).toBe(first.passportRef);
  expect(calls).toBe(0);
}, 60000);
