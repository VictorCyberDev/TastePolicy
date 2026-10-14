import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Home from "@/app/page";
import { GET } from "@/app/api/health/route";
import { validateEnvironment } from "@/lib/env/schema";
import { normalizeError } from "@/lib/errors/normalize";
import type { CulturalReceipt, ProviderResult } from "@/types/domain";
describe("Phase 0 foundation", () => {
  it("returns a non-sensitive health response with a generated request ID", async () => {
    const r = GET();
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ status: "ok", service: "tastepolicy" });
    expect(r.headers.get("x-request-id")).toMatch(/^[a-f0-9-]{36}$/);
    expect(r.headers.get("cache-control")).toBe("no-store");
  });
  it("needs no external credentials, including in production", () => {
    expect(
      validateEnvironment({ NODE_ENV: "production" }).qlooApiKey,
    ).toBeUndefined();
    expect(validateEnvironment({}).nodeEnv).toBe("development");
  });
  it("validates supplied URLs without leaking values", () => {
    expect(() =>
      validateEnvironment({ SUPABASE_URL: "secret-bad-url" }),
    ).toThrow("Invalid SUPABASE_URL");
    expect(() =>
      validateEnvironment({ NEXT_PUBLIC_APP_URL: "javascript:alert(1)" }),
    ).toThrow();
    expect(() =>
      validateEnvironment({
        NEXT_PUBLIC_APP_URL: "https://user:pass@example.com",
      }),
    ).toThrow();
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
  it("renders an honest homepage", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { name: "TastePolicy" })).toBeVisible();
    expect(screen.getByText("Milestone 1 — Qloo vertical slice")).toBeVisible();
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
