import { it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import StatePanel from "@/features/state/StatePanel";
import { syntheticReceipt } from "./receipt-presentation-fixture";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("starts only on explicit action and unavailable does not fabricate state", async () => {
  const fetcher = vi.fn(async () => ({
    ok: false,
    json: async () => ({
      status: "unavailable",
      reason: "persistence_not_configured",
    }),
  }));
  vi.stubGlobal("fetch", fetcher);
  render(<StatePanel receipt={null} />);
  expect(fetcher).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "Start / resume demo profile" }),
  );
  await waitFor(() =>
    expect(screen.getByLabelText("Taste State operation")).toHaveTextContent(
      "not configured",
    ),
  );
  expect(screen.queryByText(/Taste State version/)).toBeNull();
  vi.unstubAllGlobals();
});
it("state and graph controls are labeled; broad durable mutation requires explicit confirmation", async () => {
  const snapshot = {
    state: {
      stateVersion: 1,
      stateHash: "a".repeat(64),
      entries: [
        {
          signalId: "test-only",
          kind: "EXPLICIT_LIKE",
          entity: syntheticReceipt().inputSignals[0],
          scope: "GLOBAL_PREFERENCE",
          persistence: "DURABLE",
          source: "USER",
          sourceEventId: "test-only",
        },
      ],
    },
    previous: null,
    evaluations: [],
    feedback: [],
    graph: { nodes: [], edges: [], semanticHash: "b".repeat(64) },
    diff: {
      added: [],
      removed: [],
      changedConstraints: [],
      feedbackEventIds: [],
    },
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ status: "available", data: snapshot }),
    })),
  );
  render(<StatePanel receipt={syntheticReceipt()} />);
  fireEvent.click(
    screen.getByRole("button", { name: "Start / resume demo profile" }),
  );
  await screen.findByText("Taste State version 1");
  expect(screen.getByLabelText("Logical agent")).toBeVisible();
  fireEvent.change(screen.getByLabelText("Applicability scope"), {
    target: { value: "GLOBAL_PREFERENCE" },
  });
  expect(screen.getByRole("checkbox")).not.toBeChecked();
  expect(screen.getByText(/applies globally until/)).toBeVisible();
  vi.unstubAllGlobals();
});
