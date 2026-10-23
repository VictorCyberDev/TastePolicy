import { Blob as NodeBlob, File as NodeFile } from "node:buffer";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useConsumerAuthorization } from "@/features/arena/useConsumerAuthorization";
import {
  consumerHarness,
  consumerCandidate,
  consumerAlternative,
} from "./consumer-authorization-fixture";
import { entities } from "./qloo-fixtures";
beforeEach(() => {
  vi.stubGlobal("Blob", NodeBlob);
  vi.stubGlobal("File", NodeFile);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("budget → genuine ASK → captured price answer leaves SQL state unchanged", async () => {
  const h = await consumerHarness();
  try {
    const { result } = renderHook(() =>
      useConsumerAuthorization(h.call, entities.slice(0, 5), vi.fn()),
    );
    await act(() => result.current.budget(consumerCandidate));
    expect(result.current.evaluation?.decision.outcome).toBe("ASK");
    expect(result.current.plan?.factor?.kind).toBe("PRICE_REQUIRED");
    const before = (await h.read()).state;
    expect(before.stateVersion).toBe(2);
    const root = structuredClone(result.current.evaluation);
    await act(() =>
      result.current.answer({ kind: "PRICE", amount: 40, currency: "USD" }),
    );
    expect(result.current.interaction?.finalDecision.outcome).toBe("ALLOW");
    expect(result.current.evaluation).toEqual(root);
    expect((await h.read()).state).toEqual(before);
    expect(h.calls.filter((c) => c.path.endsWith("/answer"))).toHaveLength(1);
  } finally {
    await h.db.close();
  }
}, 30000);
it("UNKNOWN stays ASK; exclusion advances once, and budget-blocked repair never removes rules", async () => {
  const h = await consumerHarness();
  try {
    const { result } = renderHook(() =>
      useConsumerAuthorization(h.call, entities.slice(0, 5), vi.fn()),
    );
    await act(() => result.current.budget(consumerCandidate));
    await act(() => result.current.answer({ kind: "UNKNOWN" }));
    expect(result.current.interaction?.finalDecision.outcome).toBe("ASK");
    expect((await h.read()).state.stateVersion).toBe(2);
    await act(() => result.current.exclude(consumerCandidate));
    expect(result.current.evaluation?.decision.outcome).toBe("REJECT");
    const before = (await h.read()).state;
    expect(before.stateVersion).toBe(3);
    await act(() => result.current.findAlternative());
    expect(result.current.repair?.status).toBe("NO_VERIFIABLE_REPAIR");
    expect((await h.read()).state).toEqual(before);
  } finally {
    await h.db.close();
  }
}, 30000);
it("one verified alternative is only a proposal until a fresh state evaluation; original exclusion survives", async () => {
  const h = await consumerHarness();
  try {
    const adopt = vi.fn();
    const { result } = renderHook(() =>
      useConsumerAuthorization(h.call, entities.slice(0, 5), adopt),
    );
    await act(() => result.current.exclude(consumerCandidate));
    const before = (await h.read()).state;
    const original = result.current.evaluation!;
    expect(original.decision.outcome).toBe("REJECT");
    await act(() => result.current.findAlternative());
    expect(result.current.repair?.status).toBe("REPAIR_AVAILABLE");
    expect(result.current.evaluation).toEqual(original);
    expect(adopt).toHaveBeenCalledWith(consumerAlternative);
    expect((await h.read()).state).toEqual(before);
    const evalCount = h.calls.filter(
      (c) => c.path === "/api/state/evaluate",
    ).length;
    await act(() => result.current.check(consumerAlternative));
    expect(
      h.calls.filter((c) => c.path === "/api/state/evaluate"),
    ).toHaveLength(evalCount + 1);
    expect(result.current.evaluation?.evaluationId).not.toBe(
      result.current.repair?.verification?.evaluationId,
    );
    expect(result.current.evaluation?.decision.outcome).toBe("ALLOW");
    const after = (await h.read()).state;
    expect(after).toEqual(before);
    expect(
      after.entries.some(
        (e) =>
          e.candidateId === consumerCandidate.id &&
          e.constraint?.kind === "EXCLUDE_CANDIDATE",
      ),
    ).toBe(true);
    expect(JSON.stringify(h.calls)).not.toMatch(
      /wikimedia|licenseUrl|presentationOnly/,
    );
  } finally {
    await h.db.close();
  }
}, 30000);

it("reuses matching saved anchors and rejects different anchors without overwriting SQL state", async () => {
  const h = await consumerHarness();
  try {
    const first = renderHook(() =>
      useConsumerAuthorization(h.call, entities.slice(0, 5), vi.fn()),
    );
    await act(() => first.result.current.ensureState());
    const second = renderHook(() =>
      useConsumerAuthorization(h.call, entities.slice(0, 5), vi.fn()),
    );
    await act(() => second.result.current.ensureState());
    expect(h.calls.filter((c) => c.path.endsWith("/mutate"))).toHaveLength(1);
    const before = (await h.read()).state;
    const third = renderHook(() =>
      useConsumerAuthorization(
        h.call,
        [entities[5], ...entities.slice(1, 5)],
        vi.fn(),
      ),
    );
    await expect(act(() => third.result.current.ensureState())).rejects.toThrow(
      "saved preferences are different",
    );
    expect((await h.read()).state).toEqual(before);
  } finally {
    await h.db.close();
  }
}, 30000);
it("real provider failure remains UNAVAILABLE without a fabricated Cultural Receipt or state advance", async () => {
  const h = await consumerHarness();
  try {
    const { result } = renderHook(() =>
      useConsumerAuthorization(h.call, entities.slice(0, 5), vi.fn()),
    );
    await act(() => result.current.ensureState());
    const before = (await h.read()).state;
    h.fail();
    await act(() => result.current.check(consumerCandidate));
    expect(result.current.evaluation?.decision.outcome).toBe("UNAVAILABLE");
    expect(result.current.evaluation?.cultural.status).toBe("unavailable");
    expect((await h.read()).state).toEqual(before);
    expect(h.calls.filter((c) => c.path.endsWith("/evaluate"))).toHaveLength(1);
  } finally {
    await h.db.close();
  }
}, 30000);
it("manual retry after a lost answer response reuses the idempotency key and durable result", async () => {
  const h = await consumerHarness();
  try {
    let lost = true;
    const call: typeof h.call = async (path, body) => {
      const value = await h.call(path, body);
      if (path.endsWith("/answer") && lost) {
        lost = false;
        throw Error("Synthetic lost response");
      }
      return value as never;
    };
    const { result } = renderHook(() =>
      useConsumerAuthorization(call, entities.slice(0, 5), vi.fn()),
    );
    await act(() => result.current.budget(consumerCandidate));
    const before = (await h.read()).state;
    await expect(
      act(() =>
        result.current.answer({ kind: "PRICE", amount: 40, currency: "USD" }),
      ),
    ).rejects.toThrow("Synthetic lost response");
    await act(() =>
      result.current.answer({ kind: "PRICE", amount: 40, currency: "USD" }),
    );
    const calls = h.calls.filter((c) => c.path.endsWith("/answer"));
    expect(calls).toHaveLength(2);
    expect(calls[0].body.idempotencyKey).toBe(calls[1].body.idempotencyKey);
    expect(result.current.interaction?.finalDecision.outcome).toBe("ALLOW");
    expect((await h.read()).state).toEqual(before);
    const count = await h.db.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM tastepolicy.clarification_records",
    );
    expect(count.rows[0].count).toBe("1");
  } finally {
    await h.db.close();
  }
}, 30000);
