// The four states a person can be in. Resolved from what the account API says
// about the signed-in person, never from the page they happen to be on.
export type PassportSummary = {
  passportRef: string;
  displayLabel: string;
  stateVersion: number;
  expiresAt: string;
};
export type ProductState =
  | { kind: "LOADING" }
  | { kind: "VISITOR" }
  | { kind: "AUTHENTICATED_UNONBOARDED" }
  | { kind: "ACTIVE"; passport: PassportSummary }
  | { kind: "UNAVAILABLE"; code: string };

// DEMO is not a state of a person: it is a labelled page (judge, scenarios).
export function resolveProductState(
  httpOk: boolean,
  body: unknown,
): ProductState {
  const b = (body ?? {}) as {
    status?: string;
    code?: string;
    data?: { passport?: PassportSummary | null };
  };
  if (b.status === "available" && b.data) {
    return b.data.passport
      ? { kind: "ACTIVE", passport: b.data.passport }
      : { kind: "AUTHENTICATED_UNONBOARDED" };
  }
  if (b.code === "AUTH_REQUIRED") return { kind: "VISITOR" };
  return {
    kind: "UNAVAILABLE",
    code: String(b.code ?? (httpOk ? "" : "HTTP")),
  };
}
// Where a person belongs for a destination that needs a real Passport.
export function homeFor(state: ProductState): string {
  return state.kind === "ACTIVE"
    ? "/dashboard"
    : state.kind === "AUTHENTICATED_UNONBOARDED"
      ? "/onboarding"
      : "/login";
}
