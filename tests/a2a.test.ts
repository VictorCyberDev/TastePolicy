// @vitest-environment node
import { beforeAll, afterAll, it, expect } from "vitest";
import {
  platformDatabase,
  account,
  init,
  subjectProvider,
  future,
} from "./platform-fixtures";
import { handleA2a, agentCard } from "@/server/platform/a2a";
import { proposal } from "./interactive-fixtures";

let d: Awaited<ReturnType<typeof platformDatabase>>;
beforeAll(async () => {
  d = await platformDatabase();
}, 30000);
afterAll(async () => d?.db.close());

const URL_ = "https://tastepolicy.test/api/a2a";
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
  const rpc = (
    method: string,
    params: unknown,
    headers: Record<string, string> = {},
    token = k.secret!,
  ) =>
    handleA2a(
      new Request(URL_, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "a2a-version": "1.0",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...headers,
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 7, method, params }),
      }),
      deps,
    );
  return { passport, rpc, secret: k.secret! };
}
const message = (passportRef: string, messageId: string, n = 1) => ({
  message: {
    messageId,
    role: "ROLE_USER",
    parts: [
      {
        data: { passportRef, proposal: proposal(n) },
        mediaType: "application/json",
      },
    ],
  },
});

it("Agent Card is a valid 1.0 card with required fields and no secrets", () => {
  const c = agentCard("https://tastepolicy.test") as Record<string, unknown>;
  for (const f of [
    "name",
    "description",
    "supportedInterfaces",
    "version",
    "capabilities",
    "defaultInputModes",
    "defaultOutputModes",
    "skills",
  ])
    expect(c).toHaveProperty(f);
  expect(c.supportedInterfaces).toEqual([
    {
      url: "https://tastepolicy.test/api/a2a",
      protocolBinding: "JSONRPC",
      protocolVersion: "1.0",
    },
  ]);
  expect(JSON.stringify(c)).not.toMatch(/tp_live_|passportRef":"tp_/);
});
it("SendMessage returns a COMPLETED task whose artifact carries the one evaluator's decision; GetTask is scoped to the caller", async () => {
  const s = await setup(),
    r = await s.rpc(
      "SendMessage",
      message(s.passport.passportRef, "a2a-msg-0001"),
    );
  expect(r.status).toBe(200);
  const j = await r.json();
  expect(j.result.task.status.state).toBe("TASK_STATE_COMPLETED");
  const data = j.result.task.artifacts[0].parts[0].data;
  expect(data.decision).toBe("ALLOW");
  expect(data.continuation).toBeDefined();
  const again = await (
    await s.rpc("SendMessage", message(s.passport.passportRef, "a2a-msg-0001"))
  ).json();
  expect(again.result.task.id).toBe(j.result.task.id);
  const got = await (await s.rpc("GetTask", { id: j.result.task.id })).json();
  expect(got.result.status.state).toBe("TASK_STATE_COMPLETED");
  const other = await setup(),
    denied = await (
      await other.rpc("GetTask", { id: j.result.task.id })
    ).json();
  expect(denied.error.code).toBe(-32001);
  const cancel = await (
    await s.rpc("CancelTask", { id: j.result.task.id })
  ).json();
  expect(cancel.error.code).toBe(-32002);
}, 30000);
it("enforces auth, version, scope and operation support with A2A error codes", async () => {
  const s = await setup(["RECEIPT_READ"]);
  const noauth = await s.rpc("GetTask", { id: "x" }, {}, "");
  expect(noauth.status).toBe(401);
  expect(noauth.headers.get("www-authenticate")).toContain("Bearer");
  const badVersion = await (
    await s.rpc("GetTask", { id: "x" }, { "a2a-version": "0.3" })
  ).json();
  expect(badVersion.error.code).toBe(-32009);
  const noVersion = await s.rpc("GetTask", { id: "x" }, { "a2a-version": "" });
  expect((await noVersion.json()).error.code).toBe(-32009);
  const scope = await s.rpc(
    "SendMessage",
    message(s.passport.passportRef, "a2a-msg-0002"),
  );
  expect(scope.status).toBe(403);
  expect((await scope.json()).error.data[0].reason).toBe("ACCESS_DENIED");
  for (const [m, code] of [
    ["SendStreamingMessage", -32004],
    ["ListTasks", -32004],
    ["CreateTaskPushNotificationConfig", -32003],
    ["GetExtendedAgentCard", -32007],
    ["Nonsense", -32601],
  ] as const)
    expect((await (await s.rpc(m, {})).json()).error.code).toBe(code);
  const bad = await (
    await s.rpc("SendMessage", { message: { messageId: "short" } })
  ).json();
  expect(bad.error).toBeDefined();
});
it("message with missing or ambiguous data parts is invalid input, not a decision", async () => {
  const s = await setup();
  const r = await (
    await s.rpc("SendMessage", {
      message: {
        messageId: "a2a-msg-0003",
        role: "ROLE_USER",
        parts: [{ text: "hi" }],
      },
    })
  ).json();
  expect(r.error.code).toBe(-32602);
  expect(JSON.stringify(r)).not.toMatch(/ALLOW|REJECT/);
});

it("official @a2a-js/sdk client resolves the card and completes a SendMessage round-trip", async () => {
  const { ClientFactory, ClientFactoryOptions, JsonRpcTransportFactory } =
    await import("@a2a-js/sdk/client");
  const { Role } = await import("@a2a-js/sdk");
  const { GET } = await import("@/app/.well-known/agent-card.json/route");
  const s = await setup(),
    deps = { store: d.store, factory: () => subjectProvider().q };
  const routed = (async (input: string | URL | Request, init?: RequestInit) => {
    const req = new Request(input as URL, init);
    if (new URL(req.url).pathname === "/.well-known/agent-card.json")
      return GET(req);
    req.headers.set("authorization", `Bearer ${s.secret}`);
    return handleA2a(req, deps);
  }) as typeof fetch;
  const factory = new ClientFactory(
    ClientFactoryOptions.createFrom(ClientFactoryOptions.default, {
      transports: [new JsonRpcTransportFactory({ fetchImpl: routed })],
      cardResolver: new (
        await import("@a2a-js/sdk/client")
      ).DefaultAgentCardResolver({ fetchImpl: routed }),
    }),
  );
  const client = await factory.createFromUrl("https://tastepolicy.test");
  const out = await client.sendMessage({
    tenant: "",
    configuration: undefined,
    metadata: undefined,
    message: {
      messageId: "sdk-msg-00001",
      contextId: "",
      taskId: "",
      role: Role.ROLE_USER,
      metadata: undefined,
      extensions: [],
      referenceTaskIds: [],
      parts: [
        {
          content: {
            $case: "data",
            value: {
              passportRef: s.passport.passportRef,
              proposal: proposal(1),
            },
          },
          filename: "",
          mediaType: "application/json",
          metadata: undefined,
        },
      ],
    },
  });
  const { TaskState } = await import("@a2a-js/sdk");
  const t = out as { status?: { state?: number }; artifacts?: unknown[] };
  expect(t.status?.state).toBe(TaskState.TASK_STATE_COMPLETED);
  expect(JSON.stringify(t.artifacts)).toContain('"decision":"ALLOW"');
}, 30000);
