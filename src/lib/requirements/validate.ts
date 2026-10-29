import {
  FACT_EVIDENCE,
  FACT_SOURCE_TYPES,
  FACT_STATES,
  REQUIREMENT_OPERATORS,
  type CandidateFact,
  type FactValue,
  type Requirement,
} from "./types";

export const MAX_REQUIREMENTS = 24;
export const MAX_FACTS = 64;
const KEY = /^[a-z][a-z0-9_]{0,39}$/;

const rec = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
const only = (r: Record<string, unknown>, allowed: string[]) =>
  Object.keys(r).every((k) => allowed.includes(k));
const text = (v: unknown, max: number) =>
  typeof v === "string" && v.length >= 1 && v.length <= max ? v : null;
const scalar = (v: unknown): v is FactValue =>
  (typeof v === "string" && v.length >= 1 && v.length <= 80) ||
  (typeof v === "number" && Number.isFinite(v)) ||
  typeof v === "boolean";

export function parseRequirements(value: unknown): Requirement[] | null {
  if (!Array.isArray(value) || value.length > MAX_REQUIREMENTS) return null;
  const out: Requirement[] = [];
  for (const raw of value) {
    const r = rec(raw);
    if (
      !r ||
      !only(r, [
        "key",
        "operator",
        "expected",
        "importance",
        "sourceRequirement",
        "unit",
        "label",
        "maxFactAgeDays",
      ]) ||
      typeof r.key !== "string" ||
      !KEY.test(r.key) ||
      !REQUIREMENT_OPERATORS.includes(r.operator as never) ||
      (r.importance !== "hard" && r.importance !== "soft") ||
      (r.sourceRequirement !== "USER" &&
        r.sourceRequirement !== "EXPLICIT_CONTEXT")
    )
      return null;
    const set = r.operator === "in" || r.operator === "not_in";
    const expected = r.expected;
    if (set) {
      if (
        !Array.isArray(expected) ||
        !expected.length ||
        expected.length > 12 ||
        !expected.every(scalar)
      )
        return null;
    } else if (!scalar(expected)) return null;
    const numeric = ["lte", "gte", "lt", "gt"].includes(r.operator as string);
    if (numeric && typeof expected !== "number") return null;
    const req: Requirement = {
      key: r.key,
      operator: r.operator as Requirement["operator"],
      expected: expected as Requirement["expected"],
      importance: r.importance,
      sourceRequirement: r.sourceRequirement,
    };
    if (r.unit !== undefined) {
      const u = text(r.unit, 16);
      if (!u) return null;
      req.unit = u;
    }
    if (r.label !== undefined) {
      const l = text(r.label, 120);
      if (!l) return null;
      req.label = l;
    }
    if (r.maxFactAgeDays !== undefined) {
      if (
        typeof r.maxFactAgeDays !== "number" ||
        !Number.isFinite(r.maxFactAgeDays) ||
        r.maxFactAgeDays <= 0 ||
        r.maxFactAgeDays > 3650
      )
        return null;
      req.maxFactAgeDays = r.maxFactAgeDays;
    }
    out.push(req);
  }
  return out;
}

export function parseFacts(value: unknown): CandidateFact[] | null {
  if (!Array.isArray(value) || value.length > MAX_FACTS) return null;
  const out: CandidateFact[] = [];
  for (const raw of value) {
    const r = rec(raw);
    if (
      !r ||
      !only(r, [
        "key",
        "value",
        "state",
        "evidence",
        "source",
        "sourceType",
        "observedAt",
        "confidence",
        "unit",
        "note",
      ]) ||
      typeof r.key !== "string" ||
      !KEY.test(r.key) ||
      !FACT_STATES.includes(r.state as never) ||
      !FACT_EVIDENCE.includes(r.evidence as never) ||
      // "qloo" as a source of a place fact is refused: Qloo is cultural evidence.
      !FACT_SOURCE_TYPES.includes(r.sourceType as never)
    )
      return null;
    const source = text(r.source, 80);
    if (!source || /qloo/i.test(source)) return null;
    // A known fact carries a value; unknown/unavailable ones must not.
    if (r.state === "known" ? !scalar(r.value) : r.value !== null) return null;
    const fact: CandidateFact = {
      key: r.key,
      value: r.value as CandidateFact["value"],
      state: r.state as CandidateFact["state"],
      evidence: r.evidence as CandidateFact["evidence"],
      source,
      sourceType: r.sourceType as CandidateFact["sourceType"],
    };
    if (r.observedAt !== undefined) {
      if (
        typeof r.observedAt !== "string" ||
        !Number.isFinite(Date.parse(r.observedAt))
      )
        return null;
      fact.observedAt = r.observedAt;
    }
    if (r.confidence !== undefined) {
      if (
        typeof r.confidence !== "number" ||
        r.confidence < 0 ||
        r.confidence > 1
      )
        return null;
      fact.confidence = r.confidence;
    }
    for (const k of ["unit", "note"] as const)
      if (r[k] !== undefined) {
        const t = text(r[k], k === "note" ? 200 : 16);
        if (!t) return null;
        fact[k] = t;
      }
    out.push(fact);
  }
  return out;
}

// Decision-relevant material only, in a stable order, for commitments.
export function requirementMaterial(requirements: Requirement[]) {
  return [...requirements]
    .map((r) => ({
      key: r.key,
      operator: r.operator,
      expected: r.expected,
      importance: r.importance,
      sourceRequirement: r.sourceRequirement,
      ...(r.unit ? { unit: r.unit } : {}),
      ...(r.maxFactAgeDays !== undefined
        ? { maxFactAgeDays: r.maxFactAgeDays }
        : {}),
    }))
    .sort(
      (a, b) =>
        a.key.localeCompare(b.key) || a.operator.localeCompare(b.operator),
    );
}
export function factMaterial(facts: CandidateFact[]) {
  return [...facts]
    .map((f) => ({
      key: f.key,
      value: f.value,
      state: f.state,
      evidence: f.evidence,
      source: f.source,
      sourceType: f.sourceType,
    }))
    .sort(
      (a, b) =>
        a.key.localeCompare(b.key) ||
        a.source.localeCompare(b.source) ||
        a.state.localeCompare(b.state),
    );
}
