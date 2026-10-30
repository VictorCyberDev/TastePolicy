import type { EntityQuery } from "@/types/domain";
import type { Requirement } from "@/lib/requirements/types";
import type { SubjectiveAction } from "@/lib/policy/types";

// Needs are modelled as functional consequences ("walking_minutes <= 10"),
// never as diagnoses. Anchor captions are authored story copy, not Qloo output;
// the exact Qloo identities are resolved and reviewed at runtime.
export type AnswerSpec =
  | { type: "yesno"; yes: string; no: string }
  | { type: "number"; unit: string; max: number }
  | { type: "choice"; options: { value: string; label: string }[] };

export interface Persona {
  id: "margaret" | "sensory-aware" | "low-energy" | "you";
  path: string;
  name: string;
  tagline: string;
  story: string;
  quote: string;
  anchors: (EntityQuery & { caption: string })[];
  requirements: Requirement[];
  answers: Record<string, AnswerSpec>;
  origin?: { lat: number; lng: number; label: string };
  ceiling: SubjectiveAction;
  contextKey: string;
  cta: string;
}

const user = { sourceRequirement: "USER" as const };

export const MARGARET: Persona = {
  id: "margaret",
  path: "/demo/margaret",
  name: "Margaret",
  tagline: "Margaret's mobility changed. Her taste didn't.",
  story:
    "Margaret is 72. She still knows exactly what she enjoys. Walking far, standing in crowds and steep entrances are harder now, and her assistant is helping her choose where to go.",
  quote:
    "Somewhere for a lovely evening out, nothing too far, and not too loud.",
  anchors: [
    {
      query: "Miles Davis",
      expectedType: "artist",
      caption: "Intimate live jazz",
    },
    {
      query: "Ella Fitzgerald",
      expectedType: "artist",
      caption: "Voices she grew up with",
    },
    { query: "Casablanca", expectedType: "movie", caption: "Classic cinema" },
    {
      query: "Cinema Paradiso",
      expectedType: "movie",
      caption: "Classic cinema",
    },
    {
      query: "Eataly",
      expectedType: "brand",
      caption: "Tuscan & Italian dining",
    },
  ],
  requirements: [
    {
      key: "accessible_entrance",
      operator: "eq",
      expected: true,
      importance: "hard",
      label: "Step-free entrance",
      ...user,
    },
    {
      key: "walking_minutes",
      operator: "lte",
      expected: 10,
      importance: "hard",
      unit: "min",
      label: "Walk of 10 minutes or less",
      ...user,
    },
    {
      key: "noise_level",
      operator: "in",
      expected: ["low", "moderate"],
      importance: "soft",
      label: "A quieter room",
      ...user,
    },
    {
      key: "price",
      operator: "lte",
      expected: 75,
      importance: "soft",
      unit: "USD",
      label: "Within $75",
      ...user,
    },
  ],
  answers: {
    accessible_entrance: {
      type: "yesno",
      yes: "Yes, step-free",
      no: "No, there are steps",
    },
    walking_minutes: { type: "number", unit: "minutes", max: 120 },
    noise_level: {
      type: "choice",
      options: [
        { value: "low", label: "Quiet" },
        { value: "moderate", label: "Moderate" },
        { value: "high", label: "Loud" },
      ],
    },
  },
  origin: {
    lat: 40.7359,
    lng: -73.9911,
    label: "Margaret's home (demo location)",
  },
  ceiling: "SHORTLIST",
  contextKey: "evening_out",
  cta: "Find places that feel like Margaret",
};

export const SENSORY: Persona = {
  id: "sensory-aware",
  path: "/experience/sensory-aware",
  name: "Sensory-aware night out",
  tagline:
    "Don't just give me a calm place. Give me somewhere I'll actually love.",
  story:
    "Loud music and heavy crowds are too much tonight, but this person's taste is as big as ever. Same boundary, different need: noise is a requirement, not a diagnosis.",
  quote:
    "I want somewhere tonight, but I can't deal with very loud music or heavy crowds. I love Studio Ghibli, jazz, Japanese food and bookstores.",
  anchors: [
    { query: "Spirited Away", expectedType: "movie", caption: "Studio Ghibli" },
    { query: "Nujabes", expectedType: "artist", caption: "Jazz-tinged beats" },
    {
      query: "Norwegian Wood",
      expectedType: "book",
      caption: "Quiet, wistful fiction",
    },
    { query: "Kinokuniya", expectedType: "brand", caption: "Bookstores" },
    {
      query: "Tokyo",
      expectedType: "destination",
      caption: "Japanese food & streets",
    },
  ],
  requirements: [
    {
      key: "noise_level",
      operator: "in",
      expected: ["low", "moderate"],
      importance: "hard",
      label: "No very loud music",
      ...user,
    },
    {
      key: "crowd_level",
      operator: "in",
      expected: ["low", "moderate"],
      importance: "soft",
      label: "Not heavily crowded",
      ...user,
    },
  ],
  answers: {
    noise_level: {
      type: "choice",
      options: [
        { value: "low", label: "Quiet" },
        { value: "moderate", label: "Moderate" },
        { value: "high", label: "Loud" },
      ],
    },
  },
  ceiling: "SHORTLIST",
  contextKey: "sensory_evening",
  cta: "Find somewhere I'll love",
};

export const LOW_ENERGY: Persona = {
  id: "low-energy",
  path: "/experience/low-energy",
  name: "Low-energy day",
  tagline:
    "I can only walk about ten minutes today. I still want somewhere enjoyable.",
  story:
    "Some days energy is the constraint. Distance becomes a requirement ('walking_minutes <= 10') and taste still leads. No medical advice, no diagnosis, just a rule the person set.",
  quote:
    "I can only walk about ten minutes today. I still want somewhere enjoyable.",
  anchors: [
    { query: "Nils Frahm", expectedType: "artist", caption: "Gentle piano" },
    {
      query: "Perfect Days",
      expectedType: "movie",
      caption: "Slow, observant cinema",
    },
    { query: "Muji", expectedType: "brand", caption: "Quiet design" },
    {
      query: "Piranesi",
      expectedType: "book",
      caption: "Strange, calm fiction",
    },
    { query: "Severance", expectedType: "tv_show", caption: "Cerebral TV" },
  ],
  requirements: [
    {
      key: "walking_minutes",
      operator: "lte",
      expected: 10,
      importance: "hard",
      unit: "min",
      label: "Walk of 10 minutes or less",
      ...user,
    },
    {
      key: "seated_option",
      operator: "eq",
      expected: true,
      importance: "soft",
      label: "Somewhere to sit",
      ...user,
    },
  ],
  answers: {
    walking_minutes: { type: "number", unit: "minutes", max: 120 },
  },
  origin: {
    lat: 40.7359,
    lng: -73.9911,
    label: "Your starting point (demo location)",
  },
  ceiling: "SHORTLIST",
  contextKey: "low_energy_day",
  cta: "Find somewhere enjoyable",
};

export const PERSONAS = [MARGARET, SENSORY, LOW_ENERGY] as const;
