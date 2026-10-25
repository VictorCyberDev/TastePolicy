// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- assertions over loosely typed JSON-RPC responses */
import { beforeAll, afterAll, it, expect } from "vitest";
import {
  calculateJwkThumbprint,
  exportJWK,
  generateKeyPair,
  type JWK,
} from "jose";
import {
  platformDatabase,
  account,
  init,
  subjectProvider,
  future,
} from "./platform-fixtures";
import {
  handleA2a,
  agentCard,
  AUTHORITY_EXTENSION,
  HANDOFF_MEDIA_TYPE,
} from "@/server/platform/a2a";
import { handlePlatform } from "@/server/platform/http";
import { handleMcp } from "@/server/platform/mcp";
import { AttestationService } from "@/server/platform/attest-service";
import { present, type Signer } from "@/lib/attest/sdjwt";
import { VCT } from "@/lib/attest/issue";
import { proposal } from "./interactive-fixtures";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";

let d: Awaited<ReturnType<typeof platformDatabase>>;
const ORIGIN = "https://tastepolicy.test";
const AUD = "https://receiver.test";
let issuerJwk: JWK;
beforeAll(async () => {
  d = await platformDatabase();
  const { privateKey } = await generateKeyPair("ES256", { extractable: true });
  issuerJwk = await exportJWK(privateKey);
  process.env.TASTEPOLICY_PUBLIC_ORIGIN = ORIGIN;
  process.env.TASTEPOLICY_ATTESTATION_KEY = JSON.stringify(issuerJwk);
}, 30000);
afterAll(async () => {
  delete process.env.TASTEPOLICY_PUBLIC_ORIGIN;
  delete process.env.TASTEPOLICY_ATTESTATION_KEY;
  await d?.db.close();
});
void VCT;

let n = 0;
async function setup() {
  const a = await account(d),
    q = subjectProvider(),
    passport: any = await d.service.initialize(a.principal, init(), () => q.q);
  const mk = async (scopes: string[]) =>
    (
      (await d.service.issueKey(a.principal, {
        idempotencyKey: "k" + ++n,
        displayLabel: "SYNTHETIC TEST DATA",
        scopes,
        expiresAt: future(),
      })) as any
    ).secret as string;
  const agentA = await mk(["PASSPORT_READ", "TASTE_EVALUATE", "RECEIPT_READ"]);
  // the receiving agent has its own, minimal credential
  const b = await account(d);
  const agentB = (
    (await d.service.issueKey(b.principal, {
      idempotencyKey: "k" + ++n,
      displayLabel: "SYNTHETIC TEST DATA",
      scopes: ["PASSPORT_READ"],
      expiresAt: future(),
    })) as any
  ).secret as string;
  const deps = { store: d.store, factory: () => q.q };
  const rpc = async (
    token: string,
    method: string,
    params: unknown,
    headers: Record<string, string> = {},
  ) =>
    (await (
      await handleA2a(
        new Request(`${ORIGIN}/api/a2a`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "a2a-version": "1.0",
            authorization: `Bearer ${token}`,
            ...headers,
          },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        }),
        deps,
      )
    ).json()) as any;
  const send = (token: string, data: Record<string, unknown>) =>
    rpc(token, "SendMessage", {
      message: {
        messageId: "msg-" + ++n + "-xxxxxxxx",
        role: "ROLE_USER",
        extensions: [AUTHORITY_EXTENSION],
        parts: [{ data, mediaType: "application/json" }],
      },
    });
  return { a, passport, agentA, agentB, deps, rpc, send, q };
}
const priced = (amount: number) =>
  proposal(1, {
    key: "trip",
    domain: "destination",
    price: { amount, currency: "USD" },
  });
const art = (r: any) => r.result.task.artifacts[0].parts[0].data;

it("the Agent Card declares the extension (optional) and the lifecycle skills", () => {
  const c = agentCard(ORIGIN) as any;
  expect(c.capabilities.extensions).toEqual([
    expect.objectContaining({
      uri: AUTHORITY_EXTENSION,
      required: false,
      params: expect.objectContaining({
        handoffMediaType: HANDOFF_MEDIA_TYPE,
        publicVerifier: `${ORIGIN}/api/attest/verify`,
      }),
    }),
  ]);
  expect(c.skills.map((s: any) => s.id)).toEqual([
    "preference_authorization",
    "authority_lease",
    "authority_attestation",
  ]);
  expect(JSON.stringify(c)).toMatch(/never payment|No purchase|never grants/i);
  expect(c.skills[0].description).toMatch(/Use this before you select, rank/);
});
it("issue, hand off and verify over A2A: evaluate → lease → key-bound proof → receiving agent verifies against its own context; drift kills proof A, resume issues proof B", async () => {
  const w = await setup();
  const now = () => Math.floor(Date.now() / 1000);
  // 1. evaluate with an explicit ladder request
  const ev = await w.send(w.agentA, {
    operation: "evaluate",
    passportRef: w.passport.passportRef,
    requestedAction: "ADD_TO_DRAFT",
    proposal: priced(100),
  });
  const e = art(ev);
  expect([e.decision, e.requestedAction]).toEqual(["ALLOW", "ADD_TO_DRAFT"]);
  // 2. lease
  const ls = await w.send(w.agentA, {
    operation: "lease.request",
    evaluationRef: e.evaluationRef,
  });
  const lease = art(ls);
  expect(ls.result.task.status.state).toBe("TASK_STATE_COMPLETED");
  expect(lease).toMatchObject({ status: "ACTIVE", valid: true });
  // 3. proof for the receiving agent's key
  const { publicKey, privateKey } = await generateKeyPair("ES256", {
    extractable: true,
  });
  const pub = await exportJWK(publicKey);
  const receiver: Signer = {
    key: privateKey,
    alg: "ES256",
    kid: await calculateJwkThumbprint(pub),
  };
  const issued = await w.send(w.agentA, {
    operation: "attestation.issue",
    leaseRef: lease.leaseRef,
    audience: AUD,
    holderKey: pub,
    delegateAgentId: "Agent-B",
  });
  expect(issued.result.task.artifacts[0].parts[0].mediaType).toBe(
    HANDOFF_MEDIA_TYPE,
  );
  const proofA = art(issued).attestation as string;
  // 4. the receiving agent presents (key-bound, its own challenge) and verifies
  const share = (nonce: string) =>
    present(
      proofA,
      [
        "decision",
        "permitted_actions",
        "context_commitment",
        "candidate_commitment",
        "delegate_agent_id",
      ],
      { signer: receiver, nonce, aud: AUD, iat: now() },
    );
  const verify = async (presentation: string, nonce: string, ctx: unknown) =>
    art(
      await w.send(w.agentB, {
        operation: "attestation.verify",
        presentation,
        audience: AUD,
        nonce,
        expect: { context: ctx },
      }),
    );
  const good = await verify(await share("c1"), "c1", priced(100).context);
  expect(good).toMatchObject({
    valid: true,
    trustedAuthority: true,
    signature: "VALID",
    commitments: { context: "MATCHED" },
  });
  expect(good.claims).toMatchObject({
    delegate_agent_id: "Agent-B",
    permitted_actions: ["SUGGEST", "RANK", "SHORTLIST", "ADD_TO_DRAFT"],
  });
  // the receiver learns the bounded continuation and nothing about the person
  expect(JSON.stringify(good)).not.toMatch(
    /passportRef|subjectRef|stateHash|tp_[a-f0-9]{20}/,
  );
  // replay, wrong nonce, wrong holder, wrong situation
  expect(
    (await verify(await share("c1"), "c1", priced(100).context)).reasons,
  ).toEqual(["REPLAY"]);
  expect(
    (await verify(await share("c2"), "other", priced(100).context)).reasons,
  ).toEqual(["KB_NONCE_MISMATCH"]);
  const thief = await generateKeyPair("ES256", { extractable: true });
  const forged = await present(proofA, ["decision", "context_commitment"], {
    signer: { key: thief.privateKey, alg: "ES256", kid: "x" },
    nonce: "c3",
    aud: AUD,
    iat: now(),
  });
  expect((await verify(forged, "c3", priced(100).context)).reasons).toEqual([
    "KB_INVALID",
  ]);
  expect(
    (await verify(await share("c4"), "c4", priced(450).context)).reasons,
  ).toEqual(["CONTEXT_COMMITMENT_MISMATCH"]);
  // 5. the situation changes; the issuing agent tells TastePolicy; proof A is dead
  await new Promise((r) => setTimeout(r, 15));
  const moved = await w.send(w.agentA, {
    operation: "lease.checkpoint",
    leaseRef: lease.leaseRef,
    context: priced(450).context,
  });
  expect(art(moved)).toMatchObject({
    status: "SUSPENDED",
    reasons: ["CONTEXT_CHANGED"],
  });
  expect(
    (await verify(await share("c5"), "c5", priced(100).context)).reasons,
  ).toEqual(["STATUS_INVALID"]);
  // 6. fresh evaluation, resume, proof B for the new context
  await new Promise((r) => setTimeout(r, 15));
  const e2 = art(
    await w.send(w.agentA, {
      operation: "evaluate",
      passportRef: w.passport.passportRef,
      requestedAction: "ADD_TO_DRAFT",
      proposal: priced(450),
    }),
  );
  const back = art(
    await w.send(w.agentA, {
      operation: "lease.resume",
      leaseRef: lease.leaseRef,
      evaluationRef: e2.evaluationRef,
      context: priced(450).context,
    }),
  );
  expect(back.status).toBe("ACTIVE");
  const proofB = art(
    await w.send(w.agentA, {
      operation: "attestation.issue",
      leaseRef: lease.leaseRef,
      audience: AUD,
      holderKey: pub,
    }),
  ).attestation as string;
  const shareB = await present(proofB, ["decision", "context_commitment"], {
    signer: receiver,
    nonce: "b1",
    aud: AUD,
    iat: now(),
  });
  expect(await verify(shareB, "b1", priced(450).context)).toMatchObject({
    valid: true,
  });
  // A never comes back
  expect(
    (await verify(await share("c6"), "c6", priced(100).context)).reasons,
  ).toEqual(["STATUS_INVALID"]);
  // 7. GetTask reads the lease through the same authoritative verify; Cancel releases it
  const got = await w.rpc(w.agentA, "GetTask", { id: lease.leaseRef });
  expect(got.result.artifacts[0].parts[0].data.status).toBe("ACTIVE");
  const gone = await w.rpc(w.agentA, "CancelTask", { id: lease.leaseRef });
  expect(gone.result.artifacts[0].parts[0].data.status).toBe("RELEASED");
  expect((await verify(shareB, "b1", priced(450).context)).valid).toBe(false);
}, 120000);
it("a pending owner confirmation is TASK_STATE_INPUT_REQUIRED; a clarification has no lease", async () => {
  const w = await setup();
  await new AttestationService(d.store).policyPublish(w.a.principal, {
    idempotencyKey: "pp-" + ++n + "-key",
    passportRef: w.passport.passportRef,
    expectedVersion: 0,
    document: {
      schemaVersion: "taste-policy-v1",
      freshness: {},
      autonomy: { default: "OBSERVE", byDomain: {}, byAgent: {} },
    },
  });
  const e = art(
    await w.send(w.agentA, {
      operation: "evaluate",
      passportRef: w.passport.passportRef,
      proposal: priced(100),
    }),
  );
  expect(e).toMatchObject({
    decision: "ASK",
    ask: { kind: "AUTHORITY_CONFIRMATION" },
  });
  const ls = await w.send(w.agentA, {
    operation: "lease.request",
    evaluationRef: e.evaluationRef,
  });
  expect(ls.result.task.status.state).toBe("TASK_STATE_INPUT_REQUIRED");
  expect(art(ls)).toMatchObject({
    status: "ASK_PENDING",
    valid: false,
    permittedActions: [],
  });
});
it("protocol edges: no extension means legacy semantics; unknown operations and stray keys are rejected; scopes are enforced", async () => {
  const w = await setup();
  // without activation an `operation` key is not part of the evaluation contract
  const legacy = await w.rpc(w.agentA, "SendMessage", {
    message: {
      messageId: "legacy-msg-1",
      role: "ROLE_USER",
      parts: [
        {
          data: {
            operation: "lease.request",
            passportRef: w.passport.passportRef,
            proposal: priced(100),
          },
          mediaType: "application/json",
        },
      ],
    },
  });
  expect(legacy.error.code).toBe(-32602);
  // the same header-activated
  const viaHeader = await w.rpc(
    w.agentA,
    "SendMessage",
    {
      message: {
        messageId: "hdr-msg-0001",
        role: "ROLE_USER",
        parts: [
          {
            data: {
              operation: "lease.verify",
              leaseRef: "tl_" + "a".repeat(48),
            },
            mediaType: "application/json",
          },
        ],
      },
    },
    { "a2a-extensions": AUTHORITY_EXTENSION },
  );
  expect(viaHeader.error.message).toBe("LEASE_NOT_FOUND");
  for (const bad of [
    { operation: "lease.destroy" },
    { operation: 7 },
    {},
    {
      operation: "attestation.verify",
      presentation: "x",
      audience: "http://insecure",
    },
  ]) {
    const r = await w.send(w.agentA, bad as Record<string, unknown>);
    expect(r.error?.code).toBeDefined();
  }
  // a credential without TASTE_EVALUATE cannot request a lease
  const ro = await w.send(w.agentB, {
    operation: "lease.request",
    evaluationRef: "tp_" + "a".repeat(48),
  });
  expect(ro.error.message).toBe("ACCESS_DENIED");
});
it("cross-surface: REST, MCP, A2A and the service return the same authority facts for the same choice", async () => {
  const w = await setup();
  await new AttestationService(d.store).policyPublish(w.a.principal, {
    idempotencyKey: "pp-" + ++n + "-key",
    passportRef: w.passport.passportRef,
    expectedVersion: 0,
    document: {
      schemaVersion: "taste-policy-v1",
      freshness: {},
      autonomy: { default: "AUTONOMOUS", byDomain: {}, byAgent: {} },
      actions: { default: "SHORTLIST", byDomain: {}, byAgent: {} },
    },
  });
  const body = (k: string) => ({
    idempotencyKey: k,
    passportRef: w.passport.passportRef,
    requestedAction: "ADD_TO_DRAFT",
    proposal: priced(100),
  });
  const full = new AttestationService(d.store);
  const viaService: any = await full
    .credentialPrincipal(w.agentA)
    .then((p) =>
      full.evaluate(p, body("svc-" + ++n + "-key"), () => w.q.q, "r"),
    );
  const viaRest: any = (
    await (
      await handlePlatform(
        new Request(`${ORIGIN}/api/v1/evaluate`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${w.agentA}`,
          },
          body: JSON.stringify(body("rest-" + ++n + "-key")),
        }),
        "evaluate",
        "v1",
        d.store,
        () => w.q.q,
      )
    ).json()
  ).data;
  const client = new Client(
    { name: "t", version: "1" },
    { versionNegotiation: { mode: "auto" } },
  );
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${ORIGIN}/api/mcp`), {
      fetch: ((i: string | URL | Request, o?: RequestInit) =>
        handleMcp(new Request(i as URL, o), w.deps)) as typeof fetch,
      requestInit: { headers: { Authorization: `Bearer ${w.agentA}` } },
    }),
  );
  const viaMcp = (
    await client.callTool({
      name: "tastepolicy_evaluate_choice",
      arguments: body("mcp-" + ++n + "-key"),
    })
  ).structuredContent as any;
  await client.close();
  const viaA2a = art(
    await w.send(w.agentA, {
      operation: "evaluate",
      ...body("a2a-" + ++n + "-key"),
    }),
  );
  const facts = (r: any) => ({
    decision: r.decision,
    basis: r.decisionBasis,
    ask: r.ask?.kind,
    requested: r.requestedAction,
    permittedActions: r.continuation.permittedActions,
    commitments: r.commitments,
    ceiling: r.policy?.action?.ceiling,
    escalation: r.policy?.action?.escalationRequired,
  });
  expect(facts(viaService)).toMatchObject({
    decision: "ASK",
    basis: "ACTION_CEILING",
    ask: "AUTHORITY_CONFIRMATION",
    ceiling: "SHORTLIST",
    escalation: true,
  });
  for (const other of [viaRest, viaMcp, viaA2a])
    expect(facts(other)).toEqual(facts(viaService));
});
