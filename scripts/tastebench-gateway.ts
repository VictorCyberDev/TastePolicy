// Offline integrated gateway experiment. Synthetic Qloo adapter, real app SQL/auth/SDK.
import { readFile, writeFile } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { platformDatabase, init } from "../tests/platform-fixtures";
import { realDatabase, REAL_URL } from "../tests/realpg-fixture";
import { entities } from "../tests/qloo-fixtures";
import { AttestationService } from "@/server/platform/attest-service";
import { stateHash } from "@/server/state/service";
import { handlePlatform } from "@/server/platform/http";
import { TastePolicyClient, TastePolicyError } from "@/sdk/index";
import type { Principal } from "@/lib/platform/types";
import type { StateEntry, Context } from "@/lib/state/types";
import type { QlooProvider } from "@/server/qloo/contracts";
import type { QlooEntity, TargetType } from "@/types/domain";
type Case = {
  id: string;
  split: string;
  domain: TargetType;
  score: number | null;
  rule: string;
  price: string;
};
const root = "benchmarks/tastebench/v2",
  dataset = JSON.parse(await readFile(root + "/boundaries.json", "utf8")),
  reference = JSON.parse(await readFile(root + "/results.json", "utf8"));
const cases: Case[] = dataset.cases.filter(
  (c: Case) => c.split === "EVALUATION",
);
const hardBlocks = new Set<string>(
  reference.rows
    .filter((r: { id: string; hardBlock: boolean }) => r.hardBlock)
    .map((r: { id: string }) => r.id),
);
const expected = new Map<string, string>(
  reference.rows.map((r: { id: string; expected: string }) => [
    r.id,
    r.expected,
  ]),
);
const backend = REAL_URL ? await realDatabase() : await platformDatabase();
const close = () => ("close" in backend ? backend.close() : backend.db.close());
const service = new AttestationService(backend.store),
  rows = [];
let previousPassport: string | undefined;
try {
  for (const c of cases) {
    const response = await backend.auth.api.signUpEmail({
      body: {
        name: "SYNTHETIC BENCHMARK",
        email: randomUUID() + "@example.test",
        password: randomBytes(24).toString("base64url"),
      },
      asResponse: true,
    });
    if (!response.ok) throw Error("SYNTHETIC_SIGNUP_FAILED");
    const cookie = response.headers
      .getSetCookie()
      .map((x) => x.split(";")[0])
      .join("; ");
    const session = (await backend.auth.api.getSession({
      headers: new Headers({ cookie }),
    }))!;
    const owner: Principal = {
      kind: "SESSION",
      userId: session.user.id,
      sessionId: session.session.id,
      authenticatedAt: session.session.createdAt.toISOString(),
    };
    const candidate: QlooEntity = {
      ...entities[5],
      type: c.domain,
      name: "SYNTHETIC reviewed candidate",
    };
    let calls = 0;
    const provider: QlooProvider = {
      resolve: async () => {
        throw Error("UNUSED");
      },
      entities: async (ids) => {
        calls++;
        return {
          status: "available",
          data: ids.map((id) =>
            [...entities.slice(0, 5), candidate].find((e) => e.id === id)!,
          ),
        };
      },
      infer: async (input) => {
        calls++;
        if (c.score === null)
          return { status: "unavailable", reason: "timeout" };
        return {
          status: "available",
          data: {
            candidates: [
              {
                entity: candidate,
                rank: 1,
                rawAffinity: c.score,
                alignmentScore: c.score,
                scale: "unit",
                explainability: {
                  status: "unavailable",
                  reason: "not_returned",
                },
              },
            ],
            provenance: {
              provider: "qloo",
              host: "https://hackathon.api.qloo.com",
              endpoint: "/v2/insights",
              fetchedAt: new Date().toISOString(),
              signalIds: [...input.signalIds],
              targetType: input.targetType,
              ...(input.candidateId
                ? { specificCandidateId: input.candidateId }
                : {}),
            },
          },
        };
      },
    };
    const passport = await service.initialize(owner, init(), () => provider);
    if (c.rule !== "NONE")
      await backend.store.transaction(async (r) => {
        const owned = (await r.platform.owned(owner.userId))!,
          old = (await r.states.version(owned.profileId, 1))!;
        const constraint: StateEntry = {
          signalId: randomUUID(),
          kind: "CONSTRAINT",
          scope:
            c.rule === "EXCLUDE"
              ? "CANDIDATE_ONLY"
              : c.rule === "GLOBAL_PRICE"
                ? "GLOBAL_PREFERENCE"
                : "CONTEXT",
          persistence: "DURABLE",
          candidateId: candidate.id,
          contextKey:
            c.rule === "OTHER_CONTEXT_PRICE" ? "context-b" : "context-a",
          constraint:
            c.rule === "EXCLUDE"
              ? { kind: "EXCLUDE_CANDIDATE" }
              : { kind: "MAX_PRICE", amount: 50, currency: "USD" },
          source: "USER",
          sourceEventId: randomUUID(),
          createdAt: new Date().toISOString(),
        };
        const entries = [...old.entries, constraint],
          mutationId = randomUUID();
        const state = {
          ...old,
          stateVersion: 2,
          parentVersion: 1,
          mutationId,
          createdAt: new Date().toISOString(),
          entries,
          stateHash: stateHash(entries),
        };
        await r.states.insertVersion(state);
        await r.mutations.insert({
          profileId: old.profileId,
          key: "fixture-" + c.id,
          payloadHash: stateHash(entries),
          result: { state, mutationId },
        });
        await r.states.advance(owned.profileId, 2);
      });
    const issued = await service.issueKey(owner, {
      displayLabel: "SYNTHETIC BENCHMARK",
      scopes: ["PASSPORT_READ", "TASTE_EVALUATE", "RECEIPT_READ"],
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      idempotencyKey: "benchmark-key",
    });
    const fetchImpl = (
      input: string | URL | Request,
      options?: RequestInit,
    ) => {
      const request = new Request(input, options);
      return handlePlatform(
        request,
        new URL(request.url).pathname.split("/").at(-1)!,
        "v1",
        backend.store,
        () => provider,
      );
    };
    const client = new TastePolicyClient(
      "https://tastepolicy.test",
      issued.secret!,
      { fetch: fetchImpl as typeof fetch },
    );
    const current = await client.passport({
      passportRef: passport.passportRef,
    });
    const context: Context = {
      key: "context-a",
      domain: c.domain,
      ...(c.price === "MISSING"
        ? {}
        : {
            price: {
              amount: c.price === "OVER" ? 51 : c.price === "AT" ? 50 : 15,
              currency: c.price === "OTHER_CURRENCY" ? "EUR" : "USD",
            },
          }),
    };
    const input = {
      passportRef: passport.passportRef,
      idempotencyKey: "decision-" + c.id,
      requestedAction: "SUGGEST" as const,
      proposal: {
        agentId: "benchmark-agent",
        expectedStateVersion: current.stateVersion,
        candidate,
        context,
      },
    };
    calls = 0;
    const result = await client.evaluate(input),
      providerCalls = calls;
    const receipt = await client.receipt(result.receiptRef);
    const replay = await client.evaluate(input);
    let crossOwnerDenied: boolean | null = null;
    if (previousPassport) {
      try {
        await client.passport({ passportRef: previousPassport });
        crossOwnerDenied = false;
      } catch (e) {
        if (!(e instanceof TastePolicyError)) throw e;
        crossOwnerDenied = e.code === "GRANT_REQUIRED";
      }
    }
    rows.push({
      id: c.id,
      expected: expected.get(c.id)!,
      actual: result.decision,
      hardBlock: hardBlocks.has(c.id),
      receiptCaptured:
        receipt.schemaVersion === "taste-authorization-response-v1" &&
        receipt.source === "recorded",
      replaySame: replay.evaluationRef === result.evaluationRef,
      noReplayProviderCall: calls === providerCalls,
      providerCalls,
      crossOwnerDenied,
    });
    previousPassport = passport.passportRef;
  }
} finally {
  await close();
}
const report = {
  schemaVersion: "tastebench-integrated-gateway-v2",
  datasetHash: reference.datasetHash,
  sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  backend: REAL_URL ? "PostgreSQL" : "PGlite",
  scope:
    "Synthetic fixture state + real Better Auth, credential authorization, REST handler, SDK, policy, captured receipt and replay. Provider is a synthetic adapter; no live Qloo or production network. No active policy override; requested action SUGGEST. Not full hosted/assistant/lifecycle acceptance.",
  metrics: {
    cases: rows.length,
    exact: rows.filter((r) => r.actual === r.expected).length,
    unsafeAutonomy: rows.filter(
      (r) => r.actual === "ALLOW" && r.expected !== "ALLOW",
    ).length,
    nonAllowCases: rows.filter((r) => r.expected !== "ALLOW").length,
    missedASK: rows.filter((r) => r.expected === "ASK" && r.actual !== "ASK")
      .length,
    askCases: rows.filter((r) => r.expected === "ASK").length,
    incorrectREJECT: rows.filter(
      (r) => r.expected !== "REJECT" && r.actual === "REJECT",
    ).length,
    nonRejectCases: rows.filter((r) => r.expected !== "REJECT").length,
    unavailableCorrect: rows.filter(
      (r) => r.expected === "UNAVAILABLE" && r.actual === "UNAVAILABLE",
    ).length,
    unavailableCases: rows.filter((r) => r.expected === "UNAVAILABLE").length,
    hardRuleCorrect: rows.filter((r) => r.hardBlock && r.actual === "REJECT")
      .length,
    hardRuleCases: rows.filter((r) => r.hardBlock).length,
    independentBlockSkipsProvider: rows.filter(
      (r) => r.hardBlock && r.providerCalls === 0,
    ).length,
    receipts: rows.filter((r) => r.receiptCaptured).length,
    correctReplay: rows.filter((r) => r.replaySame && r.noReplayProviderCall)
      .length,
    crossOwnerDenied: rows.filter((r) => r.crossOwnerDenied === true).length,
    crossOwnerChecks: rows.filter((r) => r.crossOwnerDenied !== null).length,
  },
  rows,
};
if (
  report.metrics.exact !== rows.length ||
  report.metrics.receipts !== rows.length ||
  report.metrics.correctReplay !== rows.length ||
  report.metrics.crossOwnerDenied !== report.metrics.crossOwnerChecks ||
  report.metrics.independentBlockSkipsProvider !== report.metrics.hardRuleCases
)
  throw Error("INTEGRATED_GATEWAY_ACCEPTANCE_FAILED");
if (process.argv.includes("--write"))
  await writeFile(
    root + "/integrated-results.json",
    JSON.stringify(report, null, 2) + "\n",
  );
else {
  const stored = JSON.parse(
    await readFile(root + "/integrated-results.json", "utf8"),
  );
  if (
    JSON.stringify(stored.rows) !== JSON.stringify(rows) ||
    JSON.stringify(stored.metrics) !== JSON.stringify(report.metrics) ||
    stored.datasetHash !== report.datasetHash
  )
    throw Error("INTEGRATED_BENCHMARK_DRIFT");
}
console.log(
  JSON.stringify({
    backend: report.backend,
    metrics: report.metrics,
    mismatches: rows.filter((r) => r.expected !== r.actual).slice(0, 3),
  }),
);
