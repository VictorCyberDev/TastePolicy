// @vitest-environment node
import { it, expect } from "vitest";
import {
  LEASE_STATUSES,
  LeaseTransitionError,
  driftReasons,
  isTerminal,
  observe,
  reduce,
  replay,
  type Fingerprint,
  type LeaseEvent,
  type LeaseState,
} from "@/lib/lease/machine";

const T0 = "2026-10-24T10:00:00.000Z",
  T1 = "2026-10-24T10:05:00.000Z",
  T2 = "2026-10-24T10:10:00.000Z",
  T3 = "2026-10-24T10:15:00.000Z";
const fp: Fingerprint = {
  stateHash: "h1",
  policyVersion: 1,
  grantId: null,
  overrideIds: [],
};
const issued = (decision: "ALLOW" | "ASK"): LeaseEvent => ({
  kind: "ISSUED",
  at: T0,
  actor: "AGENT",
  decision,
  expiresAt: T3,
  checkpointDueAt: T1,
  fingerprint: fp,
});
const all = (): LeaseEvent[] => [
  issued("ALLOW"),
  {
    kind: "APPROVED",
    at: T0,
    actor: "OWNER",
    fingerprint: fp,
    expiresAt: T3,
    checkpointDueAt: T1,
  },
  { kind: "DECLINED", at: T0, actor: "OWNER" },
  { kind: "CHECKPOINT_OK", at: T0, actor: "AGENT", checkpointDueAt: T2 },
  { kind: "DRIFT", at: T0, actor: "SYSTEM", reasons: ["STATE_CHANGED"] },
  {
    kind: "RESUMED",
    at: T0,
    actor: "AGENT",
    fingerprint: fp,
    checkpointDueAt: T2,
  },
  { kind: "REVOKED", at: T0, actor: "OWNER" },
  { kind: "EXPIRED", at: T0, actor: "SYSTEM" },
  { kind: "RELEASED", at: T0, actor: "AGENT" },
];
const KINDS = all().map((e) => e.kind);
// Reference table: from-status -> allowed event kinds.
const ALLOWED: Record<string, string[]> = {
  ASK_PENDING: ["APPROVED", "DECLINED", "REVOKED", "EXPIRED"],
  ACTIVE: ["CHECKPOINT_OK", "DRIFT", "REVOKED", "EXPIRED", "RELEASED"],
  SUSPENDED: ["RESUMED", "REVOKED", "EXPIRED", "RELEASED"],
  DECLINED: [],
  REVOKED: [],
  EXPIRED: [],
  RELEASED: [],
};
function reach(status: string): LeaseState {
  const path: Record<string, LeaseEvent[]> = {
    ASK_PENDING: [issued("ASK")],
    ACTIVE: [issued("ALLOW")],
    SUSPENDED: [
      issued("ALLOW"),
      { kind: "DRIFT", at: T0, actor: "SYSTEM", reasons: ["STATE_CHANGED"] },
    ],
    DECLINED: [issued("ASK"), { kind: "DECLINED", at: T0, actor: "OWNER" }],
    REVOKED: [issued("ALLOW"), { kind: "REVOKED", at: T0, actor: "OWNER" }],
    EXPIRED: [issued("ALLOW"), { kind: "EXPIRED", at: T0, actor: "SYSTEM" }],
    RELEASED: [issued("ALLOW"), { kind: "RELEASED", at: T0, actor: "AGENT" }],
  };
  return replay(path[status]);
}
it("the transition table is exactly the documented one (every status x every event)", () => {
  for (const status of LEASE_STATUSES)
    for (const e of all().filter((e) => e.kind !== "ISSUED")) {
      const legal = ALLOWED[status].includes(e.kind);
      const run = () => reduce(reach(status), e);
      if (legal) expect(run().rev).toBeGreaterThan(reach(status).rev);
      else expect(run).toThrow(LeaseTransitionError);
    }
  expect(() => reduce(reach("ACTIVE"), issued("ALLOW"))).toThrow(
    LeaseTransitionError,
  );
  expect(() => reduce(null, all()[3])).toThrow(LeaseTransitionError);
});
it("terminal states never leave; only owner approval activates a pending lease; drift needs a reason", () => {
  for (const s of LEASE_STATUSES.filter(isTerminal))
    for (const k of KINDS)
      if (k !== "ISSUED")
        expect(() =>
          reduce(
            reach(s),
            all().find((e) => e.kind === k)!,
          ),
        ).toThrow();
  expect(reach("ASK_PENDING").status).toBe("ASK_PENDING");
  expect(() =>
    reduce(reach("ASK_PENDING"), {
      kind: "CHECKPOINT_OK",
      at: T0,
      actor: "AGENT",
      checkpointDueAt: T1,
    }),
  ).toThrow();
  expect(() =>
    reduce(reach("ACTIVE"), {
      kind: "DRIFT",
      at: T0,
      actor: "SYSTEM",
      reasons: [],
    }),
  ).toThrow();
});
it("approval can shorten but never extend the requested lifetime", () => {
  const a = reduce(reach("ASK_PENDING"), {
    kind: "APPROVED",
    at: T1,
    actor: "OWNER",
    fingerprint: fp,
    expiresAt: T2,
    checkpointDueAt: T2,
  });
  expect([a.status, a.expiresAt]).toEqual(["ACTIVE", T2]);
  const b = reduce(reach("ASK_PENDING"), {
    kind: "APPROVED",
    at: T1,
    actor: "OWNER",
    fingerprint: fp,
    expiresAt: "2030-01-01T00:00:00.000Z",
    checkpointDueAt: T2,
  });
  expect(b.expiresAt).toBe(T3);
});
it("replay is deterministic and equals step-by-step reduction", () => {
  const events: LeaseEvent[] = [
    issued("ASK"),
    {
      kind: "APPROVED",
      at: T0,
      actor: "OWNER",
      fingerprint: fp,
      expiresAt: T3,
      checkpointDueAt: T1,
    },
    { kind: "CHECKPOINT_OK", at: T0, actor: "AGENT", checkpointDueAt: T2 },
    {
      kind: "DRIFT",
      at: T0,
      actor: "SYSTEM",
      reasons: ["POLICY_CHANGED", "STATE_CHANGED"],
    },
    {
      kind: "RESUMED",
      at: T0,
      actor: "AGENT",
      fingerprint: { ...fp, stateHash: "h2" },
      checkpointDueAt: T2,
    },
    { kind: "RELEASED", at: T0, actor: "AGENT" },
  ];
  let s: LeaseState | null = null;
  for (const e of events) s = reduce(s, e);
  expect(replay(events)).toEqual(s);
  expect(replay(events)).toEqual(replay(JSON.parse(JSON.stringify(events))));
  expect(s?.status).toBe("RELEASED");
});
it("random event sequences never break invariants (seeded, 2000 runs)", () => {
  let seed = 12345;
  const rnd = (n: number) =>
    (seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n;
  for (let run = 0; run < 2000; run++) {
    let s: LeaseState | null = reduce(null, issued(rnd(2) ? "ALLOW" : "ASK"));
    let dead = false;
    for (let i = 0; i < 12; i++) {
      const e = all()[1 + rnd(8)];
      try {
        const before: LeaseState = s!;
        s = reduce(s, e);
        expect(dead).toBe(false);
        expect(s.rev).toBe(before.rev + 1);
        if (s.status === "ACTIVE" && before.status === "ASK_PENDING")
          expect(e.kind).toBe("APPROVED");
        expect(s.expiresAt <= T3).toBe(true);
        if (isTerminal(s.status)) dead = true;
      } catch (err) {
        expect(err).toBeInstanceOf(LeaseTransitionError);
      }
    }
  }
});
it("observe applies expiry and overdue checkpoints lazily without any job", () => {
  const a = reach("ACTIVE");
  expect(observe(a, T0)).toMatchObject({ status: "ACTIVE", due: null });
  expect(observe(a, T1)).toMatchObject({
    status: "SUSPENDED",
    reasons: ["CHECKPOINT_OVERDUE"],
    due: "DRIFT",
  });
  expect(observe(a, T3)).toMatchObject({ status: "EXPIRED", due: "EXPIRED" });
  expect(observe(reach("ASK_PENDING"), T3).status).toBe("EXPIRED");
  expect(observe(reach("REVOKED"), T3)).toMatchObject({
    status: "REVOKED",
    due: null,
  });
});
it("drift reasons come from comparing the issued fingerprint with current facts", () => {
  const issuedFp: Fingerprint = {
    stateHash: "h1",
    policyVersion: 2,
    grantId: "g",
    overrideIds: ["o1"],
  };
  const same = {
    stateHash: "h1",
    policyVersion: 2,
    grantUsable: true,
    passportUsable: true,
    activeOverrideIds: ["o1"],
  };
  expect(driftReasons(issuedFp, same)).toEqual([]);
  expect(driftReasons(issuedFp, { ...same, stateHash: "h2" })).toEqual([
    "STATE_CHANGED",
  ]);
  expect(driftReasons(issuedFp, { ...same, policyVersion: 3 })).toEqual([
    "POLICY_CHANGED",
  ]);
  expect(driftReasons(issuedFp, { ...same, grantUsable: false })).toEqual([
    "GRANT_UNAVAILABLE",
  ]);
  expect(driftReasons(issuedFp, { ...same, activeOverrideIds: [] })).toEqual([
    "OVERRIDE_ENDED",
  ]);
  expect(
    driftReasons(issuedFp, { ...same, passportUsable: false, stateHash: "x" }),
  ).toEqual(["PASSPORT_UNAVAILABLE", "STATE_CHANGED"]);
  expect(
    driftReasons(
      { ...issuedFp, grantId: null },
      { ...same, grantUsable: false },
    ),
  ).toEqual([]);
});
