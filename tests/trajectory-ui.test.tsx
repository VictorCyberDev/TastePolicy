// SYNTHETIC TEST DATA. No live Qloo claim.
import { afterEach, it, expect, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import TrajectoryPanel from "@/features/trajectory/TrajectoryPanel";
import type { StateVersion } from "@/lib/state/types";
import { entities } from "./qloo-fixtures";
const state: StateVersion = {
  profileId: entities[0].id,
  stateVersion: 1,
  stateHash: "a".repeat(64),
  parentVersion: 0,
  mutationId: entities[1].id,
  createdAt: "2026-10-17T12:00:00Z",
  entries: entities.slice(0, 5).map((entity) => ({
    signalId: entity.id,
    kind: "EXPLICIT_LIKE",
    entity,
    scope: "GLOBAL_PREFERENCE",
    persistence: "DURABLE",
    source: "USER",
    sourceEventId: entities[1].id,
    createdAt: "2026-10-17T12:00:00Z",
  })),
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("mount makes no provider request, target saving requires identity review, and labels are explicit", () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  render(<TrajectoryPanel state={state} onRefresh={vi.fn()} />);
  expect(fetcher).not.toHaveBeenCalled();
  expect(
    screen.getByRole("button", { name: "Save exploration intent" }),
  ).toBeDisabled();
  expect(
    screen.getByRole("checkbox", {
      name: "I reviewed this exact target identity.",
    }),
  ).toBeDisabled();
  expect(screen.getByLabelText("Target domain")).toHaveValue("destination");
  expect(screen.getByLabelText("Exploration tolerance")).toHaveValue(
    "BALANCED",
  );
  expect(
    screen.getByText(/Target intent is not existing preference/),
  ).toBeVisible();
});
it("provider-independent unavailable state is intentional and exposes no raw exception", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: false,
      json: async () => ({
        status: "unavailable",
        reason: "persistence_not_configured",
      }),
    })),
  );
  render(<TrajectoryPanel state={state} onRefresh={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Target name"), {
    target: { value: "SYNTHETIC TEST DATA target" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Resolve target identities" }),
  );
  await waitFor(() =>
    expect(screen.getByLabelText("Trajectory operation")).toHaveTextContent(
      "requires configured PostgreSQL",
    ),
  );
});
