// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- assertions over loosely typed JSON responses */
// SYNTHETIC TEST DATA. Real migrations and production service paths.
import { beforeAll, afterAll, it, expect } from "vitest";
import {
  platformDatabase,
  account,
  init,
  subjectProvider,
  future,
} from "./platform-fixtures";
import { PolicyService } from "@/server/platform/policy-service";
import { DEFAULT_POLICY, type PolicyDocument } from "@/lib/policy/types";
import {
  classifyPolicyChange,
  widensAuthority,
} from "@/lib/policy/composition";
import type { Principal } from "@/lib/platform/types";

let d: Awaited<ReturnType<typeof platformDatabase>>;
let svc: PolicyService;
beforeAll(async () => {
  d = await platformDatabase();
  svc = new PolicyService(d.store);
}, 30000);
afterAll(async () => d?.db.close());

let n = 0;
async function world() {
  const owner = await account(d),
    delegate = await account(d),
    q = subjectProvider();
  const passport: any = await svc.initialize(
    owner.principal,
    init(),
    () => q.q,
  );
  const grant: any = await svc.grant(owner.principal, {
    idempotencyKey: "g" + ++n + "-delegate",
    passportRef: passport.passportRef,
    granteeUserId: delegate.principal.userId,
    scopes: ["EVALUATE_TASTE_ACTION", "READ_RECEIPT", "READ_PASSPORT_SUMMARY"],
    purpose: "Acting on my behalf",
    expiresAt: future(86_400_000),
  });
  const dk: any = await svc.issueKey(delegate.principal, {
    idempotencyKey: "dk" + ++n,
    displayLabel: "SYNTHETIC TEST DATA",
    scopes: ["PASSPORT_READ", "TASTE_EVALUATE", "RECEIPT_READ"],
    expiresAt: future(5 * 86_400_000),
  });
  return {
    owner: owner.principal,
    delegate: delegate.principal,
    delegateKey: await svc.credentialPrincipal(dk.secret),
    ref: passport.passportRef as string,
    grantId: grant.grantId as string,
  };
}
const observe: PolicyDocument = {
  ...DEFAULT_POLICY,
  autonomy: { default: "OBSERVE", byDomain: {}, byAgent: {} },
};

it("a delegate holding a grant (session or credential) can neither read nor change the owner's rules, nor create, end or simulate permissions", async () => {
  const w = await world();
  await svc.policyPublish(w.owner, {
    idempotencyKey: "dp" + ++n + "-key-0",
    passportRef: w.ref,
    document: observe,
    expectedVersion: 0,
  });
  for (const who of [w.delegate, w.delegateKey]) {
    const deny = (p: Promise<unknown>) =>
      expect(p).rejects.toMatchObject({
        code: expect.stringMatching(/ACCESS_DENIED|PASSPORT_NOT_FOUND/),
      });
    await deny(svc.policyGet(who, { passportRef: w.ref }));
    await deny(
      svc.policyPublish(who, {
        idempotencyKey: "dx" + ++n + "-key-0",
        passportRef: w.ref,
        document: DEFAULT_POLICY,
        expectedVersion: 1,
      }),
    );
    await deny(
      svc.overrideCreate(who, {
        idempotencyKey: "do" + ++n + "-key-0",
        passportRef: w.ref,
        effect: "ALLOW_THROUGH_ASK",
        scope: { domain: "place" },
        days: 2,
      }),
    );
    await deny(
      svc.overrideRevoke(who, {
        passportRef: w.ref,
        overrideId: "00000000-0000-4000-8000-000000000000",
      }),
    );
    await deny(
      svc.policySimulate(who, {
        passportRef: w.ref,
        evaluationRef: "tp_" + "a".repeat(48),
        document: DEFAULT_POLICY,
      }),
    );
  }
  // the owner's rules are untouched
  const view: any = await svc.policyGet(w.owner, { passportRef: w.ref });
  expect(view.active.version).toBe(1);
  expect(view.overrides ?? []).toHaveLength(0);
}, 60000);

it("publishing a widening change needs a recent sign-in; tightening never does; a mixed change is treated as widening", async () => {
  const w = await world();
  const stale: Principal = {
    ...w.owner,
    authenticatedAt: "2020-01-01T00:00:00.000Z",
  };
  const publish = (p: Principal, document: PolicyDocument, v: number) =>
    svc.policyPublish(p, {
      idempotencyKey: "wp" + ++n + "-key-0",
      passportRef: w.ref,
      document,
      expectedVersion: v,
    });
  const strictDefault: PolicyDocument = {
    ...DEFAULT_POLICY,
    autonomy: { default: "OBSERVE", byDomain: {}, byAgent: {} },
  };
  // tightening from the implicit open policy: no fresh sign-in needed
  await publish(stale, strictDefault, 0);
  // widening: back to autonomous
  await expect(publish(stale, DEFAULT_POLICY, 1)).rejects.toMatchObject({
    code: "RECENT_AUTH_REQUIRED",
  });
  // a per-agent exception widens even though the default stays strict
  const agentOpen: PolicyDocument = {
    ...strictDefault,
    autonomy: {
      default: "OBSERVE",
      byDomain: {},
      byAgent: { "agent-x": "AUTONOMOUS" },
    },
  };
  await expect(publish(stale, agentOpen, 1)).rejects.toMatchObject({
    code: "RECENT_AUTH_REQUIRED",
  });
  // mixed: stricter default for places, looser limit — not silently safe
  const a: PolicyDocument = {
    ...DEFAULT_POLICY,
    autonomy: {
      default: "CONFIRM_ABOVE_LIMIT",
      byDomain: {},
      byAgent: {},
      limit: { amount: 100, currency: "USD" },
    },
  };
  const mixed: PolicyDocument = {
    ...a,
    autonomy: {
      ...a.autonomy,
      byDomain: { place: "OBSERVE" },
      limit: { amount: 500, currency: "USD" },
    },
  };
  expect(classifyPolicyChange(a, mixed)).toBe("MIXED");
  expect(widensAuthority(classifyPolicyChange(a, mixed))).toBe(true);
  // the owner with a recent sign-in may widen
  await publish(w.owner, agentOpen, 1);
}, 60000);
