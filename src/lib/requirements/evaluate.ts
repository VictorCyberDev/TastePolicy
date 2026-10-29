import type {
  CandidateFact,
  FactValue,
  Requirement,
  RequirementReport,
  RequirementResult,
  UnknownReason,
} from "./types";

const DAY = 86_400_000;

function compare(r: Requirement, value: FactValue): boolean | "TYPE_MISMATCH" {
  const e = r.expected;
  switch (r.operator) {
    case "eq":
    case "neq": {
      if (Array.isArray(e) || typeof e !== typeof value) return "TYPE_MISMATCH";
      return r.operator === "eq" ? value === e : value !== e;
    }
    case "lte":
    case "gte":
    case "lt":
    case "gt": {
      if (typeof value !== "number" || typeof e !== "number")
        return "TYPE_MISMATCH";
      return r.operator === "lte"
        ? value <= e
        : r.operator === "gte"
          ? value >= e
          : r.operator === "lt"
            ? value < e
            : value > e;
    }
    case "in":
    case "not_in": {
      if (!Array.isArray(e) || e.some((x) => typeof x !== typeof value))
        return "TYPE_MISMATCH";
      const hit = e.includes(value);
      return r.operator === "in" ? hit : !hit;
    }
  }
}

const rank = (f: CandidateFact) => (f.evidence === "USER_CONFIRMED" ? 2 : 1);

function resolveOne(
  r: Requirement,
  facts: CandidateFact[],
  now: string,
): RequirementResult {
  const mine = facts.filter((f) => f.key === r.key);
  if (!mine.length)
    return { requirement: r, status: "UNKNOWN", reason: "NO_FACT" };
  const decisive = mine.filter(
    (f) => f.state === "known" && f.value !== null && f.evidence !== "INFERRED",
  );
  const fresh = decisive.filter((f) => {
    if (r.maxFactAgeDays === undefined) return true;
    const t = f.observedAt ? Date.parse(f.observedAt) : NaN;
    return Number.isFinite(t) && Date.parse(now) - t <= r.maxFactAgeDays * DAY;
  });
  if (!fresh.length) {
    if (decisive.length)
      return {
        requirement: r,
        status: "UNKNOWN",
        reason: "STALE",
        fact: decisive[0],
      };
    if (mine.some((f) => f.state === "known" && f.evidence === "INFERRED"))
      return {
        requirement: r,
        status: "UNKNOWN",
        reason: "INFERRED_ONLY",
        fact: mine.find((f) => f.state === "known"),
      };
    // No usable value. A provider that could not answer is different from a
    // fact that is simply not yet known.
    if (mine.some((f) => f.state === "unavailable"))
      return {
        requirement: r,
        status: "UNAVAILABLE",
        reason: "PROVIDER_UNAVAILABLE",
        fact: mine.find((f) => f.state === "unavailable"),
      };
    return {
      requirement: r,
      status: "UNKNOWN",
      reason: "FACT_UNKNOWN",
      fact: mine[0],
    };
  }
  const evaluated = fresh.map((f) => ({
    f,
    ok: compare(r, f.value as FactValue),
  }));
  if (evaluated.some((x) => x.ok === "TYPE_MISMATCH"))
    return {
      requirement: r,
      status: "UNKNOWN",
      reason: "TYPE_MISMATCH",
      fact: evaluated[0].f,
    };
  const oks = new Set(evaluated.map((x) => x.ok));
  // Two decisive sources that disagree cannot settle a requirement.
  if (oks.size > 1)
    return {
      requirement: r,
      status: "UNKNOWN",
      reason: "CONFLICT" satisfies UnknownReason,
      fact: evaluated.sort((a, b) => rank(b.f) - rank(a.f))[0].f,
    };
  const best = evaluated.sort((a, b) => rank(b.f) - rank(a.f))[0];
  return {
    requirement: r,
    status: best.ok === true ? "SATISFIED" : "VIOLATED",
    fact: best.f,
  };
}

// Pure and deterministic. `now` is explicit so replay gives the same answer.
export function evaluateRequirements(
  requirements: readonly Requirement[] | undefined,
  facts: readonly CandidateFact[] | undefined,
  now: string,
): RequirementReport {
  const results = (requirements ?? []).map((r) =>
    resolveOne(r, [...(facts ?? [])], now),
  );
  const hard = (s: RequirementResult["status"]) =>
    results
      .filter((x) => x.requirement.importance === "hard" && x.status === s)
      .map((x) => x.requirement.key)
      .sort();
  return {
    schemaVersion: "taste-requirements-v1",
    results,
    hardViolated: hard("VIOLATED"),
    hardUnknown: hard("UNKNOWN"),
    hardUnavailable: hard("UNAVAILABLE"),
  };
}
