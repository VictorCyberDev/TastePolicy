// SYNTHETIC TEST DATA — a stateful stand-in for the account API and Better
// Auth, so the whole first-run journey can be driven in a browser. The real
// server behaviour is covered by tests/activation.test.ts (real SQL in PGlite)
// and by the production acceptance run. The decision logic stays REAL: the
// evaluator and the session-authority engine are the production code.
import type { Page } from "@playwright/test";
import type { QlooEntity } from "../../src/types/domain";
import type { StateEvaluation, StateVersion } from "../../src/lib/state/types";
import type { Requirement } from "../../src/lib/requirements/types";
import {
  contextRequirementReport,
  stateDecision,
} from "../../src/server/state/policy";
import { sessionAuthority } from "../../src/server/state/session-authority";
import { entities } from "../qloo-fixtures";
import { receipt } from "./experience-fixture";

export interface FakeAccount {
  signedIn: boolean;
  passport: null | {
    ref: string;
    label: string;
    anchors: QlooEntity[];
    needs: {
      requirements: Requirement[];
      origin: { label: string; lat: number; lng: number } | null;
    };
    ceiling: string | null;
    policyVersion: number;
  };
  calls: { op: string; body: Record<string, unknown> }[];
  evaluations: StateEvaluation[];
}

export function fakeAccount(
  initial: Partial<Pick<FakeAccount, "signedIn">> & {
    withPassport?: boolean;
  } = {},
) {
  const fake: FakeAccount = {
    signedIn: initial.signedIn ?? false,
    passport: null,
    calls: [],
    evaluations: [],
  };
  if (initial.withPassport)
    fake.passport = {
      ref: "tpp_synthetic_existing",
      label: "SYNTHETIC existing taste",
      anchors: entities.slice(0, 5),
      needs: { requirements: [], origin: null },
      ceiling: "SHORTLIST",
      policyVersion: 1,
    };
  return fake;
}

const AUTH = {
  status: 401,
  json: { status: "error", code: "AUTH_REQUIRED" },
} as const;

export async function mockAccount(page: Page, fake: FakeAccount) {
  await page.route("**/api/auth/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/sign-up/email") || path.endsWith("/sign-in/email"))
      fake.signedIn = true;
    if (path.endsWith("/sign-out")) fake.signedIn = false;
    await route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/account/*", async (route) => {
    const op = new URL(route.request().url()).pathname.split("/").pop()!;
    const body = (route.request().postDataJSON() ?? {}) as Record<
      string,
      unknown
    >;
    fake.calls.push({ op, body });
    if (!fake.signedIn) return route.fulfill(AUTH);
    const ok = (data: unknown) =>
      route.fulfill({ json: { status: "available", data } });
    const p = fake.passport;
    const summary = () =>
      p && {
        passportRef: p.ref,
        displayLabel: p.label,
        stateVersion: 1,
        expiresAt: "2099-01-01T00:00:00.000Z",
      };
    if (op === "inspect")
      return ok({ mode: "AUTHENTICATED_ACCOUNT", passport: summary() });
    if (op === "create") {
      const ids = body.signalIds as string[];
      fake.passport = {
        ref: "tpp_synthetic_new",
        label: String(body.displayLabel),
        anchors: ids.map((id) => entities.find((e) => e.id === id)!),
        needs: { requirements: [], origin: null },
        ceiling: null,
        policyVersion: 0,
      };
      return ok(summary() ?? fake.passport);
    }
    if (!p)
      return route.fulfill({
        status: 404,
        json: { status: "error", code: "PASSPORT_NOT_FOUND" },
      });
    if (op === "taste")
      return ok({
        passportRef: p.ref,
        displayLabel: p.label,
        stateVersion: 1,
        anchors: p.anchors,
        needs: p.needs,
      });
    if (op === "needs-set") {
      // As strict as the server: only these keys are accepted.
      const extra = Object.keys(body).filter(
        (k) =>
          !["idempotencyKey", "passportRef", "requirements", "origin"].includes(
            k,
          ),
      );
      if (extra.length || typeof body.idempotencyKey !== "string")
        return route.fulfill({
          status: 400,
          json: { status: "error", code: "INVALID_INPUT" },
        });
      p.needs = {
        requirements: body.requirements as Requirement[],
        origin: (body.origin ?? null) as NonNullable<
          FakeAccount["passport"]
        >["needs"]["origin"],
      };
      return ok({ passportRef: p.ref, needs: p.needs });
    }
    if (op === "policy-get")
      return ok({
        active: p.ceiling
          ? {
              version: p.policyVersion,
              document: {
                schemaVersion: "taste-policy-v1",
                freshness: {},
                autonomy: { default: "AUTONOMOUS", byDomain: {}, byAgent: {} },
                actions: { default: p.ceiling, byDomain: {}, byAgent: {} },
              },
            }
          : null,
      });
    if (op === "policy-publish") {
      const doc = body.document as { actions: { default: string } };
      p.ceiling = doc.actions.default;
      p.policyVersion++;
      return ok({ version: p.policyVersion });
    }
    if (op === "lease-list") return ok({ pending: [] });
    if (op === "timeline") return ok({ events: [] });
    if (op === "connected-agents") return ok([]);
    if (op === "export")
      return ok({ schemaVersion: "export", anchors: p.anchors });
    if (op === "delete-passport") {
      fake.passport = null;
      return ok({ deleted: true });
    }
    if (op === "choose") {
      const proposal = body.proposal as {
        candidate: QlooEntity;
        context: StateEvaluation["context"];
      };
      const state: StateVersion = {
        profileId: "synthetic-profile",
        stateVersion: 1,
        parentVersion: 0,
        createdAt: receipt.evaluatedAt,
        mutationId: null,
        stateHash: "synthetic-state-1",
        entries: p.anchors.map((entity) => ({
          signalId: crypto.randomUUID(),
          kind: "EXPLICIT_LIKE" as const,
          entity,
          scope: "GLOBAL_PREFERENCE" as const,
          persistence: "DURABLE" as const,
          source: "USER" as const,
          sourceEventId: crypto.randomUUID(),
          createdAt: receipt.evaluatedAt,
        })),
      };
      const cultural: StateEvaluation["cultural"] = {
        status: "available",
        data: {
          ...receipt,
          candidate: proposal.candidate,
          action: { ...receipt.action, targetEntity: proposal.candidate },
        },
      };
      const report = contextRequirementReport(
        proposal.context,
        receipt.evaluatedAt,
      );
      const e: StateEvaluation = {
        schemaVersion: "taste-state-evaluation-v1",
        evaluationId: crypto.randomUUID(),
        profileId: state.profileId,
        stateVersion: 1,
        stateHash: state.stateHash,
        agentId: "Concierge",
        action: { kind: "SELECT_ENTITY", candidate: proposal.candidate },
        context: proposal.context,
        decision: stateDecision(
          state,
          proposal.candidate,
          proposal.context,
          cultural,
          receipt.evaluatedAt,
        ),
        cultural,
        culturalRequest: "REQUESTED",
        ...(report ? { requirements: report } : {}),
        requestId: crypto.randomUUID(),
        evaluatedAt: receipt.evaluatedAt,
        source: "live",
      };
      e.authority = sessionAuthority(
        state,
        e,
        {
          requestedAction: body.requestedAction as never,
          ceiling: (p.ceiling ?? "ADD_TO_DRAFT") as never,
        },
        receipt.evaluatedAt,
      );
      fake.evaluations.push(e);
      return ok({ response: { evaluationRef: e.evaluationId }, evaluation: e });
    }
    return route.fulfill({
      status: 400,
      json: { status: "error", code: "INVALID_INPUT" },
    });
  });
}
