import type { Requirement } from "@/lib/requirements/types";

// What matters to people, as functional needs. Never diagnoses: "a step-free
// entrance" is something a person asks for, not something we infer about them.
export type NeedId =
  "step_free" | "short_walk" | "quiet" | "budget" | "seating";
export interface NeedSelection {
  id: NeedId;
  on: boolean;
  value?: number;
  required: boolean;
}
export const NEED_DEFAULTS: NeedSelection[] = [
  { id: "step_free", on: false, required: true },
  { id: "short_walk", on: false, value: 10, required: true },
  { id: "quiet", on: false, required: false },
  { id: "budget", on: false, value: 75, required: false },
  { id: "seating", on: false, required: false },
];
export const NEED_COPY: Record<
  NeedId,
  { title: string; hint: string; unit?: string; options?: number[] }
> = {
  step_free: { title: "A step-free entrance", hint: "No steps to get in." },
  short_walk: {
    title: "A short walk",
    hint: "From where you start.",
    unit: "minutes",
    options: [5, 10, 15, 20, 30],
  },
  quiet: { title: "A quieter room", hint: "Easy to talk, no blaring music." },
  budget: {
    title: "Within a budget",
    hint: "A rough ceiling, per person.",
    unit: "USD",
    options: [25, 50, 75, 100, 150],
  },
  seating: { title: "Somewhere to sit", hint: "A seat is available." },
};
const imp = (n: NeedSelection) => (n.required ? "hard" : "soft");

export function buildRequirements(sel: NeedSelection[]): Requirement[] {
  const out: Requirement[] = [];
  const user = { sourceRequirement: "USER" as const };
  for (const n of sel) {
    if (!n.on) continue;
    if (n.id === "step_free")
      out.push({
        key: "accessible_entrance",
        operator: "eq",
        expected: true,
        importance: imp(n),
        label: "Step-free entrance",
        ...user,
      });
    if (n.id === "short_walk")
      out.push({
        key: "walking_minutes",
        operator: "lte",
        expected: n.value ?? 10,
        importance: imp(n),
        unit: "min",
        label: `Walk of ${n.value ?? 10} minutes or less`,
        ...user,
      });
    if (n.id === "quiet")
      out.push({
        key: "noise_level",
        operator: "in",
        expected: ["low", "moderate"],
        importance: imp(n),
        label: "A quieter room",
        ...user,
      });
    if (n.id === "budget")
      out.push({
        key: "price",
        operator: "lte",
        expected: n.value ?? 75,
        importance: imp(n),
        unit: "USD",
        label: `Within $${n.value ?? 75}`,
        ...user,
      });
    if (n.id === "seating")
      out.push({
        key: "seated_option",
        operator: "eq",
        expected: true,
        importance: imp(n),
        label: "Somewhere to sit",
        ...user,
      });
  }
  return out;
}
const KEY_TO_ID: Record<string, NeedId> = {
  accessible_entrance: "step_free",
  walking_minutes: "short_walk",
  noise_level: "quiet",
  price: "budget",
  seated_option: "seating",
};
export function selectionFromRequirements(
  reqs: Requirement[],
): NeedSelection[] {
  return NEED_DEFAULTS.map((d) => {
    const r = reqs.find((q) => KEY_TO_ID[q.key] === d.id);
    return r
      ? {
          ...d,
          on: true,
          required: r.importance === "hard",
          ...(typeof r.expected === "number" ? { value: r.expected } : {}),
        }
      : d;
  });
}
