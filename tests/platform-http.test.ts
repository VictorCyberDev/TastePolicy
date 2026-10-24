// @vitest-environment node
import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { randomBytes } from "node:crypto";
import {
  platformDatabase,
  account,
  init,
  subjectProvider,
  future,
} from "./platform-fixtures";
import { handlePlatform } from "@/server/platform/http";
import { handleAuthentication } from "@/server/platform/auth-http";
import { TastePolicyClient } from "@/sdk/index";
import { proposal } from "./interactive-fixtures";
let d: Awaited<ReturnType<typeof platformDatabase>>;
beforeAll(async () => {
  d = await platformDatabase();
}, 30000);
afterAll(async () => d?.db.close());
const request = (
  op: string,
  body: unknown = {},
  headers: Record<string, string> = {},
) =>
  new Request(`https://tastepolicy.test/api/account/${op}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      origin: "https://tastepolicy.test",
      ...headers,
    },
    body: JSON.stringify(body),
  });
it("production auth HTTP path sets secure cookies without exposing session token in JSON", async () => {
  const r = await handleAuthentication(
    new Request("https://tastepolicy.test/api/auth/sign-up/email", {
      method: "POST",
      headers: {
        origin: "https://tastepolicy.test",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "SYNTHETIC TEST DATA",
        email: "synthetic-http@example.test",
        password: randomBytes(20).toString("base64url"),
      }),
    }),
    d.auth,
  );
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ status: "authenticated" });
  expect(r.headers.get("set-cookie")).toContain("HttpOnly");
  expect(r.headers.get("set-cookie")).toContain("Secure");
});
it("auth mutations deny cross origin before creating an identity", async () => {
  const r = await handleAuthentication(
    new Request("https://tastepolicy.test/api/auth/sign-up/email", {
      method: "POST",
      headers: {
        origin: "https://attacker.test",
        "content-type": "application/json",
      },
      body: "{}",
    }),
    d.auth,
  );
  expect(r.status).toBe(403);
});
it("demo capability cannot authorize the platform", async () => {
  const r = await handlePlatform(
    request("inspect", {}, { cookie: "tastepolicy_demo=" + "a".repeat(64) }),
    "inspect",
    "account",
    d.store,
    vi.fn(),
    async () => {
      throw new (await import("@/lib/platform/types")).PlatformFailure(
        "AUTH_REQUIRED",
      );
    },
  );
  expect(r.status).toBe(401);
});
it("developer auth is mandatory and body limits are preserved", async () => {
  const factory = vi.fn();
  expect(
    (
      await handlePlatform(
        request("evaluate"),
        "evaluate",
        "v1",
        d.store,
        factory,
      )
    ).status,
  ).toBe(401);
  const a = await account(d),
    r = await handlePlatform(
      request("create", { x: "a".repeat(20_000) }),
      "create",
      "account",
      d.store,
      factory,
      async () => a.principal,
    );
  expect(r.status).toBe(413);
  expect(factory).not.toHaveBeenCalled();
});
it("credentials cannot invoke account mutation operations", async () => {
  const r = await handlePlatform(
    request("inspect", {}, { authorization: "Bearer forbidden" }),
    "inspect",
    "account",
    d.store,
    vi.fn(),
  );
  expect(r.status).toBe(403);
});
it("thin SDK uses versioned API and a real database-hashed credential", async () => {
  const a = await account(d),
    q = subjectProvider(),
    passport = await d.service.initialize(a.principal, init(), () => q.q),
    k = await d.service.issueKey(a.principal, {
      idempotencyKey: "k",
      displayLabel: "SYNTHETIC TEST DATA",
      scopes: ["PASSPORT_READ", "TASTE_EVALUATE", "RECEIPT_READ"],
      expiresAt: future(),
    });
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input, options) => {
      const r = new Request(input as URL, options);
      return handlePlatform(
        r,
        new URL(r.url).pathname.split("/").at(-1)!,
        "v1",
        d.store,
        () => q.q,
      );
    });
  try {
    const client = new TastePolicyClient("https://tastepolicy.test", k.secret!);
    const summary = await client.passport({
      passportRef: passport.passportRef,
    });
    const internal = await d.store.transaction((r) =>
      r.platform.passport(passport.passportRef),
    );
    expect(summary.stateHash).toBe(passport.stateHash);
    expect(summary.subjectRef).toBe(passport.subjectRef);
    expect(JSON.stringify(summary)).not.toContain(internal!.profileId);
    expect(summary).not.toHaveProperty("subjectId");
    const e = await client.evaluate({
      passportRef: passport.passportRef,
      idempotencyKey: "e",
      proposal: proposal(1),
    });
    expect(e.decision).toBe("ALLOW");
    const receipt = await client.receipt(e.receiptRef);
    expect(receipt.source).toBe("recorded");
    expect(receipt.subjectRef).toBe(summary.subjectRef);
    expect(receipt.receiptSchemaVersion).toBe("taste-platform-receipt-v1");
    expect(JSON.stringify(receipt)).not.toContain(internal!.profileId);
    expect(receipt).not.toHaveProperty("baseEvaluation");
    expect(
      fetcher.mock.calls.every(
        ([, o]) => o?.redirect === "error" && o.signal instanceof AbortSignal,
      ),
    ).toBe(true);
  } finally {
    fetcher.mockRestore();
  }
});
it("SDK rejects browser execution and arbitrary credential/endpoint configuration", async () => {
  expect(
    () =>
      new TastePolicyClient(
        "ftp://localhost",
        `tp_live_${crypto.randomUUID()}.${randomBytes(32).toString("base64url")}`,
      ),
  ).toThrow("Invalid TastePolicy endpoint");
  expect(
    () => new TastePolicyClient("javascript:alert(1)", "invalid"),
  ).toThrow();
  expect(
    () => new TastePolicyClient("https://tastepolicy.test", "invalid"),
  ).toThrow();
  vi.stubGlobal("window", {});
  try {
    expect(
      () =>
        new TastePolicyClient(
          "https://tastepolicy.test",
          `tp_live_${crypto.randomUUID()}.${randomBytes(32).toString("base64url")}`,
        ),
    ).toThrow("server-only");
  } finally {
    vi.unstubAllGlobals();
  }
});
it("MCP tools use the same versioned API credential, never raw subject IDs", async () => {
  const a = await account(d),
    q = subjectProvider(),
    passport = await d.service.initialize(a.principal, init(), () => q.q),
    k = await d.service.issueKey(a.principal, {
      idempotencyKey: "k",
      displayLabel: "SYNTHETIC TEST DATA",
      scopes: ["PASSPORT_READ"],
      expiresAt: future(),
    }),
    { createServer } = await import("node:http"),
    { spawn } = await import("node:child_process");
  const factory = vi.fn(() => q.q),
    server = createServer(async (req, res) => {
      try {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(Buffer.from(chunk));
        const request = new Request(`http://127.0.0.1${req.url}`, {
            method: req.method,
            headers: req.headers as Record<string, string>,
            body: Buffer.concat(chunks),
          }),
          response = await handlePlatform(
            request,
            req.url!.split("/").at(-1)!,
            "v1",
            d.store,
            factory,
          );
        res.writeHead(response.status, { "Content-Type": "application/json" });
        res.end(await response.text());
      } catch {
        res.writeHead(500);
        res.end("{}");
      }
    });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  try {
    const child = spawn(
      process.execPath,
      ["--experimental-transform-types", "scripts/platform-mcp.mjs"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          TASTEPOLICY_API_URL: `http://127.0.0.1:${port}`,
          TASTEPOLICY_API_KEY: k.secret!,
        },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    let output = "";
    child.stdout.on("data", (c) => {
      output += c;
    });
    child.stderr.resume();
    child.stdin.end(
      [
        {
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: { protocolVersion: "2025-06-18" },
        },
        { jsonrpc: "2.0", id: 2, method: "tools/list" },
        {
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: {
            name: "get_taste_passport",
            arguments: { passportRef: passport.passportRef },
          },
        },
      ]
        .map((x) => JSON.stringify(x))
        .join("\n") + "\n",
    );
    await new Promise<void>((resolve, reject) => {
      child.on("close", (code) =>
        code === 0 ? resolve() : reject(Error("MCP process failed")),
      );
    });
    const results = output
      .trim()
      .split("\n")
      .map((x) => JSON.parse(x));
    expect(
      results[1].result.tools.map((t: { name: string }) => t.name),
    ).toContain("evaluate_shared_taste_action");
    expect(JSON.parse(results[2].result.content[0].text).passportRef).toBe(
      passport.passportRef,
    );
    const summary = JSON.parse(results[2].result.content[0].text);
    const internal = await d.store.transaction((r) =>
      r.platform.passport(passport.passportRef),
    );
    expect(summary.subjectRef).toBe(passport.subjectRef);
    expect(summary.supportedCapabilities).toEqual([
      "PREFERENCE_AUTHORIZATION",
      "CAPTURED_REPLAY",
    ]);
    expect(summary.supportedActions).toEqual(["SELECT_ENTITY"]);
    expect(output).not.toContain(internal!.profileId);
    expect(summary).not.toHaveProperty("subjectId");
    expect(output).not.toContain(k.secret);
    expect(factory).not.toHaveBeenCalled();
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}, 15000);
it("origin checks preserve the existing Next request Host boundary", async () => {
  const { trustedOrigin } = await import("@/server/platform/http");
  expect(
    trustedOrigin(
      new Request("http://localhost:3000/api/account/inspect", {
        headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" },
      }),
    ),
  ).toBe(true);
  expect(
    trustedOrigin(
      new Request("http://localhost:3000/api/account/inspect", {
        headers: { host: "127.0.0.1:3000", origin: "https://attacker.test" },
      }),
    ),
  ).toBe(false);
});
