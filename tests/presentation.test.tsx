import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import Demo from "@/features/demo/Demo";
import DecisionView from "@/features/demo/DecisionView";
import ReceiptView from "@/features/demo/ReceiptView";
import { reasons, requestNotice } from "@/features/demo/presentation";
import { syntheticReceipt } from "./receipt-presentation-fixture";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("provider-independent presentation", () => {
  it.each([
    [0.9, "ALLOW"],
    [0.7, "ASK"],
    [0.2, "REJECT"],
  ] as const)("preserves %s evidence outcome %s", (score, outcome) => {
    const receipt = syntheticReceipt(score);
    render(
      <DecisionView
        receipt={receipt}
        candidate={null}
        targetType="destination"
        busy={false}
      />,
    );
    expect(screen.getByTestId("decision")).toHaveTextContent(outcome);
    expect(
      screen.getByRole("heading", { name: `Cultural policy: ${outcome}` }),
    ).toBeVisible();
    expect(screen.getByText(/grants no spending/)).toBeVisible();
    expect(screen.getByText("SELECT_ENTITY")).toBeVisible();
  });
  it("derives displayed thresholds from captured receipt", () => {
    const receipt = syntheticReceipt();
    receipt.policy.allowAbove = 0.85;
    receipt.policy.rejectBelow = 0.45;
    render(<ReceiptView receipt={receipt} />);
    expect(screen.getByText(/ALLOW above 0.85/)).toHaveTextContent(
      "ASK 0.45–0.85 inclusive · REJECT below 0.45",
    );
    expect(
      screen.getByText(/not live-calibrated or scientifically validated/),
    ).toBeVisible();
  });
  it("renders human-readable scores and versions alongside full JSON", () => {
    render(<ReceiptView receipt={syntheticReceipt()} />);
    expect(screen.getByText("0.7 / unit")).toBeVisible();
    expect(screen.getByText("Raw affinity / configured scale")).toBeVisible();
    expect(screen.getByText(/Explainability partial/)).toBeVisible();
    fireEvent.click(screen.getByText("Machine-readable receipt"));
    expect(
      screen.getByLabelText("Machine-readable Cultural Receipt"),
    ).toHaveTextContent("affinity-explicit-scale-v1");
    expect(
      screen.getByLabelText("Machine-readable Cultural Receipt"),
    ).toHaveTextContent("cultural-receipt-v1");
  });
  it("does not fabricate contribution values when unavailable", () => {
    const receipt = syntheticReceipt();
    receipt.explainability = { status: "unavailable", reason: "not_returned" };
    render(<ReceiptView receipt={receipt} />);
    expect(screen.getByText(/No contributions invented/)).toBeVisible();
    expect(screen.queryByText("0.300")).not.toBeInTheDocument();
  });
  it("keeps markup-looking labels as text", () => {
    const receipt = syntheticReceipt();
    receipt.candidate.name = "<img src=x onerror=alert(1)>";
    const { container } = render(<ReceiptView receipt={receipt} />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText(/<img src=x/, { selector: "dd" })).toBeVisible();
  });
  it("shows intentional unavailable configuration without decision or receipt", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          status: "available",
          data: Array.from({ length: 5 }, () => ({
            status: "unavailable",
            reason: "not_configured",
          })),
        }),
      ),
    );
    render(<Demo />);
    fireEvent.click(screen.getByRole("button", { name: "Resolve with Qloo" }));
    await screen.findByRole("heading", {
      name: "Cultural evaluation unavailable",
    });
    expect(
      screen.getByText(/Live Qloo verification is not configured/, {
        selector: "p",
      }),
    ).toBeVisible();
    expect(screen.queryByTestId("decision")).toBeNull();
    expect(screen.queryByText("Machine-readable receipt")).toBeNull();
  });
  it("announces real operation loading without progress percentages", async () => {
    let done!: (value: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            done = resolve;
          }),
      ),
    );
    render(<Demo />);
    fireEvent.click(screen.getByRole("button", { name: "Resolve with Qloo" }));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Resolving cultural signals",
    );
    expect(
      screen.getByRole("button", { name: "Resolve with Qloo" }),
    ).toBeDisabled();
    done(
      Response.json(
        { status: "error", code: "INVALID_INPUT" },
        { status: 400 },
      ),
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Review the request",
      ),
    );
  });
  it("associates empty signal validation and focuses the input without networking", () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    render(<Demo />);
    const input = screen.getByLabelText("Signal 1 name");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Resolve with Qloo" }));
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute(
      "aria-describedby",
      "signals-help request-error",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([
    "not_configured",
    "provider_error",
    "no_evidence",
    "unsupported_entity",
  ] as const)("preserves separate safe presentation for %s", (reason) => {
    expect(reasons[reason].title).toBeTruthy();
    expect(reasons[reason].detail).not.toMatch(/stack|X-Api-Key/);
  });
  it("distinguishes validation from safe unexpected failures", () => {
    expect(requestNotice("INVALID_INPUT").kind).toBe("validation");
    expect(requestNotice("INTERNAL_ERROR").kind).toBe("internal");
    expect(requestNotice("secret raw provider text").detail).not.toContain(
      "secret",
    );
  });
});
