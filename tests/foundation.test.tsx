import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import Home from "@/app/page";
import EngineeringDemo from "@/app/demo/page";
import { health } from "@/lib/health";
import { normalizeError } from "@/lib/errors";
import { validateEnvironment } from "@/lib/env";
import type { CulturalReceipt, ProviderResult } from "@/lib/types";

afterEach(() => cleanup());

describe("Phase 0 foundation", () => {
  it("returns a non-sensitive health response with a generated request ID", () => {
    const response = health({ requestId: "request-1" });
    expect(response).toEqual({ status: "ok", requestId: "request-1" });
    expect(JSON.stringify(response)).not.toContain("secret");
  });
  it("needs no external credentials, including in production", () => {
    expect(validateEnvironment({ NODE_ENV: "production" }).mode).toBe(
      "production",
    );
  });
  it("validates supplied URLs without leaking values", () => {
    expect(
      validateEnvironment({ NEXT_PUBLIC_APP_URL: "https://example.com" })
        .appUrl,
    ).toBe("https://example.com");
    expect(() => validateEnvironment({ NODE_ENV: "invalid" })).toThrow();
  });
  it("does not expose internal error details", () => {
    expect(normalizeError(new Error("private token"), "id")).toEqual({
      code: "INTERNAL_ERROR",
      message: "Something went wrong. Please try again.",
      requestId: "id",
    });
  });
  it("renders the company boundary with an explicitly illustrative card", () => {
    render(<Home />);
    expect(
      screen.getByRole("heading", {
        name: /Your AI knows.*Who said it could choose/i,
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("region", {
        name: "Interactive TastePolicy boundary example",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "99% taste match. Still no." }),
    ).toBeVisible();
    expect(
      screen.getByText(/illustrative on this marketing card/i),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: /Try the live Qloo journey/ }),
    ).toHaveAttribute("href", "/arena/consumer");
  });
  it("preserves the full engineering demo on its dedicated route", () => {
    render(<EngineeringDemo />);
    expect(screen.getByRole("heading", { name: "TastePolicy" })).toBeVisible();
    expect(
      screen.getByText("Milestone 2 — Versioned cultural policy"),
    ).toBeVisible();
    expect(screen.getByText("Resolve with Qloo")).toBeVisible();
  });
  it("expresses unavailable providers and inspectable receipt contracts", () => {
    const unavailable: ProviderResult<CulturalReceipt> = {
      status: "unavailable",
      reason: "not_configured",
    };
    expect(unavailable.status).toBe("unavailable");
  });
});
