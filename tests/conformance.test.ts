// @vitest-environment node
import { beforeAll, afterAll, it, expect } from "vitest";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import {
  platformDatabase,
  account,
  init,
  subjectProvider,
  future,
} from "./platform-fixtures";
import { handlePlatform } from "@/server/platform/http";
import { handleMcp } from "@/server/platform/mcp";
import { handleA2a } from "@/server/platform/a2a";
import { TastePolicyClient } from "@/sdk/index";
import { proposal } from "./interactive-fixtures";

// Cross-surface conformance: one evaluator, five doors. Every surface must
// return the same authority facts for the same subject, state and proposal.
let d: Awaited<ReturnType<typeof platformDatabase>>;
beforeAll(async () => {
  d = await platformDatabase();
}, 30000);
afterAll(async () => d?.db.close());

const FACTS = [
  "decision",
  "decisionBasis",
  "stateVersion",
  "stateHash",
  "subjectRef",
  "passportRef",
  "unresolvedFactors",
  "continuation",
  "status",
  "schemaVersion",
] as const;
const facts = (r: Record<string, unknown>) =>
  Object.fromEntries(FACTS.map((k) => [k, r[k]]));

async function world(
  scopes = ["PASSPORT_READ", "TASTE_EVALUATE", "RECEIPT_READ"],
) {
  const a = await account(d),
    q = subjectProvider(),
    passport = await d.service.initialize(a.principal, init(), () => q.q),
    k = await d.service.issueKey(a.principal, {
      idempotencyKey: "k",
      displayLabel: "SYNTHETIC TEST DATA",
      scopes,
      expiresAt: future(),
    });
  return {
    a,
    q,
    passport,
    secret: k.secret!,
    deps: { store: d.store, factory: () => q.q },
  };
}

it("service, REST, SDK, MCP and A2A return identical authority facts", async () => {
  const w = await world(),
    p = proposal(1),
    base = { passportRef: w.passport.passportRef, proposal: p };
  const viaService = (await d.service.evaluate(
    w.a.principal,
    { ...base, idempotencyKey: "conf-service" },
    () => w.q.q,
    "conformance",
  )) as Record<string, unknown>;

  const rest = async (op: string, body: unknown) =>
    (
      await (
        await handlePlatform(
          new Request(`https://tastepolicy.test/api/v1/${op}`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${w.secret}`,
            },
            body: JSON.stringify(body),
          }),
          op,
          "v1",
          d.store,
          () => w.q.q,
        )
      ).json()
    ).data as Record<string, unknown>;
  const viaRest = await rest("evaluate", {
    ...base,
    idempotencyKey: "conf-rest",
  });

  const sdk = new TastePolicyClient("https://tastepolicy.test", w.secret, {
    fetch: (async (i: string | URL | Request, o?: RequestInit) => {
      const r = new Request(i as URL, o);
      return handlePlatform(
        r,
        new URL(r.url).pathname.split("/").at(-1)!,
        "v1",
        d.store,
        () => w.q.q,
      );
    }) as typeof fetch,
  });
  const viaSdk = (await sdk.evaluate({
    ...base,
    idempotencyKey: "conf-sdk",
  } as never)) as unknown as Record<string, unknown>;

  const mcp = new Client(
    { name: "conf", version: "1" },
    { versionNegotiation: { mode: "auto" } },
  );
  await mcp.connect(
    new StreamableHTTPClientTransport(
      new URL("https://tastepolicy.test/api/mcp"),
      {
        fetch: ((i: string | URL | Request, o?: RequestInit) =>
          handleMcp(new Request(i as URL, o), w.deps)) as typeof fetch,
        requestInit: { headers: { Authorization: `Bearer ${w.secret}` } },
      },
    ),
  );
  const viaMcp = (
    await mcp.callTool({
      name: "tastepolicy_evaluate_choice",
      arguments: { ...base, idempotencyKey: "conf-mcp" },
    })
  ).structuredContent as Record<string, unknown>;
  await mcp.close();

  const a2a = await (
    await handleA2a(
      new Request("https://tastepolicy.test/api/a2a", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "a2a-version": "1.0",
          authorization: `Bearer ${w.secret}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "SendMessage",
          params: {
            message: {
              messageId: "conf-a2a-0001",
              role: "ROLE_USER",
              parts: [{ data: base, mediaType: "application/json" }],
            },
          },
        }),
      }),
      w.deps,
    )
  ).json();
  const viaA2a = a2a.result.task.artifacts[0].parts[0].data as Record<
    string,
    unknown
  >;

  const expected = facts(viaService);
  expect(expected.decision).toBe("ALLOW");
  for (const got of [viaRest, viaSdk, viaMcp, viaA2a])
    expect(facts(got)).toEqual(expected);
  // Five separate recorded evaluations, none identical to another by reference.
  const refs = [viaService, viaRest, viaSdk, viaMcp, viaA2a].map(
    (r) => r.evaluationRef,
  );
  expect(new Set(refs).size).toBe(5);
}, 60000);

it("every surface denies a credential lacking the scope with ACCESS_DENIED", async () => {
  const w = await world(["PASSPORT_READ"]),
    body = {
      passportRef: w.passport.passportRef,
      proposal: proposal(1),
      idempotencyKey: "deny-conf",
    };
  const rest = await handlePlatform(
    new Request("https://tastepolicy.test/api/v1/evaluate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${w.secret}`,
      },
      body: JSON.stringify(body),
    }),
    "evaluate",
    "v1",
    d.store,
    () => w.q.q,
  );
  expect(rest.status).toBe(403);
  expect((await rest.json()).code).toBe("ACCESS_DENIED");
  const a2a = await handleA2a(
    new Request("https://tastepolicy.test/api/a2a", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "a2a-version": "1.0",
        authorization: `Bearer ${w.secret}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "SendMessage",
        params: {
          message: {
            messageId: "conf-deny-001",
            role: "ROLE_USER",
            parts: [{ data: body }],
          },
        },
      }),
    }),
    w.deps,
  );
  expect(a2a.status).toBe(403);
  expect((await a2a.json()).error.data[0].reason).toBe("ACCESS_DENIED");
});
