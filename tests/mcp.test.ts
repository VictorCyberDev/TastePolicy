// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- assertions over loosely typed JSON */
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
import { handleMcp } from "@/server/platform/mcp";
import { proposal } from "./interactive-fixtures";

let d: Awaited<ReturnType<typeof platformDatabase>>;
beforeAll(async () => {
  d = await platformDatabase();
}, 30000);
afterAll(async () => d?.db.close());

const URL_ = "https://tastepolicy.test/api/mcp";
async function setup(
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
  const deps = { store: d.store, factory: () => q.q };
  const fetchImpl = (input: string | URL | Request, init?: RequestInit) =>
    handleMcp(new Request(input as URL, init), deps);
  return { passport, secret: k.secret!, deps, fetchImpl, q };
}
async function connect(
  s: Awaited<ReturnType<typeof setup>>,
  mode: "auto" | "legacy",
  token = s.secret,
) {
  const client = new Client(
    { name: "synthetic-test-client", version: "1.0.0" },
    { versionNegotiation: { mode } },
  );
  await client.connect(
    new StreamableHTTPClientTransport(new URL(URL_), {
      fetch: s.fetchImpl as typeof fetch,
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    }),
  );
  return client;
}

for (const mode of ["auto", "legacy"] as const)
  it(`serves the five tools and evaluates through the one evaluator (${mode} era)`, async () => {
    const s = await setup(),
      client = await connect(s, mode);
    expect(client.getProtocolEra()).toBe(mode === "auto" ? "modern" : "legacy");
    const tools = await client.listTools();
    expect(tools.tools.map((t) => t.name).sort()).toEqual(
      [
        "tastepolicy_capabilities",
        "tastepolicy_checkpoint_lease",
        "tastepolicy_evaluate_choice",
        "tastepolicy_get_authority",
        "tastepolicy_get_policy",
        "tastepolicy_get_receipt",
        "tastepolicy_get_status",
        "tastepolicy_issue_attestation",
        "tastepolicy_release_lease",
        "tastepolicy_request_lease",
        "tastepolicy_resume_lease",
        "tastepolicy_verify_attestation",
        "tastepolicy_verify_lease",
      ].sort(),
    );
    const evalTool = tools.tools.find(
      (t) => t.name === "tastepolicy_evaluate_choice",
    )!;
    expect(evalTool.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
    expect(tools.tools.every((t) => t.outputSchema)).toBe(true);
    const caps = await client.callTool({
      name: "tastepolicy_capabilities",
      arguments: {},
    });
    expect(caps.structuredContent).toMatchObject({
      unavailableIsNotReject: true,
    });
    const auth = await client.callTool({
      name: "tastepolicy_get_authority",
      arguments: { passportRef: s.passport.passportRef },
    });
    expect(auth.isError).toBeFalsy();
    const ev = await client.callTool({
      name: "tastepolicy_evaluate_choice",
      arguments: {
        passportRef: s.passport.passportRef,
        idempotencyKey: "mcp-eval-" + mode,
        proposal: proposal(1),
      },
    });
    expect(ev.isError).toBeFalsy();
    const out = ev.structuredContent as Record<string, string>;
    expect(out.decision).toBe("ALLOW");
    const st = await client.callTool({
      name: "tastepolicy_get_status",
      arguments: { evaluationRef: out.evaluationRef },
    });
    expect((st.structuredContent as Record<string, string>).decision).toBe(
      "ALLOW",
    );
    await client.close();
  }, 30000);

it("rejects missing, malformed and wrong-resource credentials with an RFC 9728 challenge", async () => {
  const s = await setup();
  for (const authorization of [undefined, "Bearer nope", "Basic abc"]) {
    const r = await s.fetchImpl(URL_, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(authorization ? { authorization } : {}),
      },
      body: "{}",
    });
    expect(r.status).toBe(401);
    expect(r.headers.get("www-authenticate")).toContain(
      'resource_metadata="https://tastepolicy.test/.well-known/oauth-protected-resource/api/mcp"',
    );
  }
});
it("denies cross-origin browsers, GET and DELETE; never accepts URL credentials", async () => {
  const s = await setup();
  const evil = await s.fetchImpl(URL_, {
    method: "POST",
    headers: {
      authorization: `Bearer ${s.secret}`,
      "content-type": "application/json",
      origin: "https://attacker.test",
    },
    body: "{}",
  });
  expect(evil.status).toBe(403);
  for (const method of ["GET", "DELETE"])
    expect((await s.fetchImpl(URL_, { method })).status).toBe(405);
  const viaUrl = await s.fetchImpl(`${URL_}?token=${s.secret}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  expect(viaUrl.status).toBe(401);
});
it("insufficient scope is a tool error, and UNAVAILABLE is a normal result not an error", async () => {
  const s = await setup(["PASSPORT_READ"]),
    client = await connect(s, "auto");
  const r = await client.callTool({
    name: "tastepolicy_evaluate_choice",
    arguments: {
      passportRef: s.passport.passportRef,
      idempotencyKey: "scope-denied",
      proposal: proposal(1),
    },
  });
  expect(r.isError).toBe(true);
  expect(r.structuredContent).toMatchObject({
    code: "ACCESS_DENIED",
    retryable: false,
  });
  expect(JSON.stringify(r)).not.toMatch(/stack|postgres|sql/i);
  await client.close();
}, 30000);

it("rejects JSON-RPC batches, and anonymous traffic never reaches the shared admission budget", async () => {
  const s = await setup();
  let admitted = 0;
  const admit = () => {
    admitted++;
    return () => {};
  };
  const post = (headers: Record<string, string>, body: string) =>
    handleMcp(
      new Request(URL_, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body,
      }),
      s.deps,
      admit,
    );
  expect((await post({}, "{}")).status).toBe(401);
  expect(admitted).toBe(0);
  const batch = await post(
    { authorization: `Bearer ${s.secret}` },
    JSON.stringify([
      { jsonrpc: "2.0", id: 1, method: "ping" },
      { jsonrpc: "2.0", id: 2, method: "ping" },
    ]),
  );
  expect(batch.status).toBe(400);
  const none = await handleMcp(
    new Request(URL_, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${s.secret}`,
      },
      body: "{}",
    }),
    s.deps,
    () => null,
  );
  expect(none.status).toBe(429);
});

it("lease tools round-trip over MCP: request, verify, checkpoint, release; verification is uncacheable", async () => {
  const s = await setup(),
    client = await connect(s, "auto");
  const call = async (name: string, args: Record<string, unknown>) =>
    (await client.callTool({ name, arguments: args }))
      .structuredContent as Record<string, any>;
  const ev = await call("tastepolicy_evaluate_choice", {
    passportRef: s.passport.passportRef,
    idempotencyKey: "mcp-lease-eval",
    proposal: proposal(1),
  });
  const l = await call("tastepolicy_request_lease", {
    idempotencyKey: "mcp-lease-req-1",
    evaluationRef: ev.evaluationRef,
  });
  expect([l.status, l.valid, l.cacheable, l.ttlMs]).toEqual([
    "ACTIVE",
    true,
    false,
    0,
  ]);
  expect(
    (await call("tastepolicy_verify_lease", { leaseRef: l.leaseRef })).valid,
  ).toBe(true);
  expect(
    (await call("tastepolicy_checkpoint_lease", { leaseRef: l.leaseRef })).rev,
  ).toBe(2);
  expect(
    (await call("tastepolicy_release_lease", { leaseRef: l.leaseRef })).status,
  ).toBe("RELEASED");
  const gone = await call("tastepolicy_verify_lease", {
    leaseRef: "tl_" + "0".repeat(48),
  });
  expect(gone.code).toBe("LEASE_NOT_FOUND");
  await client.close();
}, 30000);
