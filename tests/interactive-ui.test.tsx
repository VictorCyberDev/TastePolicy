import { it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import InteractivePanel from "@/features/interactive/InteractivePanel";
import type { StateEvaluation } from "@/lib/state/types";
const e = {
  evaluationId: "test-evaluation",
  stateVersion: 1,
  decision: { outcome: "ASK" },
} as StateEvaluation;
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("does not request on mount and keeps retry idempotency key after a lost response", async () => {
  const plan = {
    status: "ACTIONABLE",
    planId: "test-plan",
    factor: {
      kind: "CULTURAL_BORDERLINE",
      question: "Explicit disposition?",
      answerSchema: "DISPOSITION",
    },
  };
  const calls: { url: string; payload: Record<string, unknown> }[] = [];
  const fetcher = vi.fn(async (url: string, init: RequestInit) => {
    const payload = JSON.parse(init.body as string);
    calls.push({ url, payload });
    if (url.endsWith("/answer")) throw Error("Network unavailable");
    return {
      ok: true,
      json: async () => ({ status: "available", data: plan }),
    };
  });
  vi.stubGlobal("fetch", fetcher);
  render(<InteractivePanel evaluation={e} onEvaluateRepair={vi.fn()} />);
  expect(fetcher).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "Ask one clarification" }),
  );
  await screen.findByText("Explicit disposition?");
  fireEvent.click(screen.getByRole("button", { name: /^ACCEPTABLE$/ }));
  await waitFor(() =>
    expect(screen.getByLabelText("Interactive operation")).toHaveTextContent(
      "Network unavailable",
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: /^ACCEPTABLE$/ }));
  await waitFor(() =>
    expect(calls.filter((x) => x.url.endsWith("/answer"))).toHaveLength(2),
  );
  const answers = calls.filter((x) => x.url.endsWith("/answer"));
  expect(answers[0].payload.idempotencyKey).toBe(
    answers[1].payload.idempotencyKey,
  );
  expect(answers[0].payload).not.toHaveProperty("profileId");
  expect(answers[0].payload.expectedStateVersion).toBe(1);
});
