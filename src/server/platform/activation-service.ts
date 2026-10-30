import "server-only";
import { AttestationService } from "./attest-service";
import { reference } from "./service";
import { platformFail as fail, type Principal } from "@/lib/platform/types";
import { object } from "@/server/subjects/common";
import { parseRequirements } from "@/lib/requirements/validate";
import type { Requirement } from "@/lib/requirements/types";
import type { QlooProvider } from "@/server/qloo/contracts";
import type { Repositories } from "@/server/state/repositories";
import type { StateEvaluation } from "@/lib/state/types";

export interface Needs {
  requirements: Requirement[];
  origin: { label: string; lat: number; lng: number } | null;
}
const EMPTY: Needs = { requirements: [], origin: null };

function origin(v: unknown): Needs["origin"] {
  if (v === null || v === undefined) return null;
  const o = v as Record<string, unknown>;
  if (
    typeof v !== "object" ||
    Array.isArray(v) ||
    Object.keys(o).some((k) => !["label", "lat", "lng"].includes(k)) ||
    typeof o.label !== "string" ||
    o.label.length < 1 ||
    o.label.length > 120 ||
    /[\u0000-\u001f]/.test(o.label) ||
    typeof o.lat !== "number" ||
    typeof o.lng !== "number" ||
    !(o.lat >= -90 && o.lat <= 90) ||
    !(o.lng >= -180 && o.lng <= 180)
  )
    return fail("INVALID_INPUT");
  return { label: o.label, lat: o.lat, lng: o.lng };
}

// M26: what a real person told us (their taste anchors, what matters to them,
// where they start from) and one evaluation call that returns the full,
// explained decision for the person's own experience page.
export class ActivationService extends AttestationService {
  private async ownedByMe(r: Repositories, p: Principal, ref: string) {
    const passport = await r.platform.passport(ref);
    if (!passport || passport.userId !== p.userId) fail("PASSPORT_NOT_FOUND");
    return passport!;
  }
  private async needsOf(r: Repositories, ref: string): Promise<Needs> {
    const stored = (await r.needs.get(ref)) as Partial<Needs> | null;
    if (!stored) return EMPTY;
    return {
      requirements: parseRequirements(stored.requirements ?? []) ?? [],
      origin: origin(stored.origin ?? null),
    };
  }
  // The person's own taste, in plain terms: the reviewed things they chose.
  async taste(p: Principal, raw: unknown) {
    const ref = reference(object(raw, ["passportRef"]).passportRef);
    return this.store.transaction(async (r) => {
      await this.locked(r, p, [], undefined, false);
      if (p.kind !== "SESSION") fail("ACCESS_DENIED");
      const passport = await this.ownedByMe(r, p, ref);
      const profile = await r.states.profile(passport.profileId),
        state = profile
          ? await r.states.version(
              profile.profileId,
              profile.currentStateVersion,
            )
          : null;
      if (!state) fail("INTEGRITY_ERROR");
      return {
        passportRef: ref,
        displayLabel: passport.displayLabel,
        stateVersion: state!.stateVersion,
        anchors: state!.entries
          .filter((e) => e.kind === "EXPLICIT_LIKE" && e.entity)
          .map((e) => e.entity!),
        needs: await this.needsOf(r, ref),
      };
    });
  }
  async needsSet(p: Principal, raw: unknown) {
    const v = object(raw, [
        "idempotencyKey",
        "passportRef",
        "requirements",
        "origin",
      ]),
      ref = reference(v.passportRef),
      requirements = parseRequirements(v.requirements);
    if (!requirements) return fail("INVALID_INPUT");
    const next: Needs = {
      requirements: requirements.map((q) => ({
        ...q,
        sourceRequirement: "USER" as const,
      })),
      origin: origin(v.origin),
    };
    return this.store.transaction(async (r) => {
      await this.locked(r, p, [], undefined, false);
      if (p.kind !== "SESSION") fail("ACCESS_DENIED");
      await this.ownedByMe(r, p, ref);
      await r.needs.set(ref, p.userId, next, this.clock());
      return { passportRef: ref, needs: next };
    });
  }
  // The real Passport, the real state and the person's published ceiling: the
  // same evaluation as `evaluate`, plus the explained evaluation the page shows.
  async choose(
    p: Principal,
    raw: unknown,
    factory: () => QlooProvider,
    requestId: string,
  ) {
    const response = (await this.evaluate(p, raw, factory, requestId)) as {
      evaluationRef: string;
      decision: string;
    };
    return this.store.transaction(async (r) => {
      const e = await r.platform.getEvaluation(response.evaluationRef);
      if (!e || e.userId !== p.userId) fail("PASSPORT_NOT_FOUND");
      const pd = await this.policyLoad(r, e!);
      const evaluation: StateEvaluation = {
        ...e!.evaluation,
        ...(pd && e!.requestedAction
          ? {
              authority: {
                requestedAction: e!.requestedAction,
                ceiling: pd.action?.ceiling ?? "ADD_TO_DRAFT",
                ceilingSource: pd.action?.ceilingSource ?? "DEFAULT",
                escalationRequired: pd.action?.escalationRequired ?? false,
                outcome: pd.outcome,
                basis: pd.basis,
                rules: pd.rules,
                permitted: pd.action?.permitted ?? [],
              },
            }
          : {}),
      };
      return { response, evaluation };
    });
  }
}
