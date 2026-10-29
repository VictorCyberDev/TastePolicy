import { afterEach, it, expect, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import BillingTestPanel from "@/features/company/BillingTestPanel";
afterEach(async () => {
  cleanup();
  await act(async () => {
    await new Promise<void>((resolve) => setImmediate(resolve));
  });
  vi.unstubAllGlobals();
});
const workspace = {
  id: "10000000-0000-4000-8000-000000000001",
  label: "SYNTHETIC workspace",
};
it("shows unconfigured provider state without offering a live paid entitlement", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        status: "available",
        data: {
          configured: false,
          plans: [
            { mode: "LIVE", plan: "FREE", state: "ACTIVE", provider: "NONE" },
          ],
        },
      }),
    ),
  );
  render(<BillingTestPanel workspaces={[workspace]} />);
  await screen.findByText(/Stripe test billing is not configured/);
  expect(
    screen.getByRole("button", { name: "Create Stripe test checkout" }),
  ).toBeDisabled();
  expect(
    screen.getByText(/No real charge or live paid entitlement/),
  ).toBeVisible();
});
it("keeps checkout deliberate and refuses an untrusted checkout destination", async () => {
  const fetcher = vi.fn(async (input: string) =>
    Response.json({
      status: "available",
      data: input.endsWith("/status")
        ? {
            configured: true,
            plans: [
              { mode: "LIVE", plan: "FREE", state: "ACTIVE", provider: "NONE" },
            ],
          }
        : { url: "https://attacker.test/checkout" },
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  render(<BillingTestPanel workspaces={[workspace]} />);
  const button = screen.getByRole("button", {
    name: "Create Stripe test checkout",
  });
  await waitFor(() => expect(button).toBeEnabled());
  expect(fetcher.mock.calls).toHaveLength(1);
  fireEvent.click(button);
  await screen.findByText("Invalid test checkout destination.");
  expect(
    screen.queryByRole("link", { name: "Open Stripe test checkout ↗" }),
  ).not.toBeInTheDocument();
  expect(fetcher.mock.calls).toHaveLength(2);
});
