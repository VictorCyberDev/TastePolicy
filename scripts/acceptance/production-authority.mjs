// Fresh self-serve account, real Qloo Passport, independent SDK/REST/A2A.
// Run: BASE_URL=https://tastepolicy.vercel.app node --experimental-transform-types scripts/acceptance/production-authority.mjs
import { randomBytes, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
const { TastePolicyClient } = await import(
  process.env.SDK_ENTRY ?? "../../src/sdk/index.ts"
);
const base = (process.env.BASE_URL ?? "https://tastepolicy.vercel.app").replace(
  /\/$/,
  "",
);
const source = JSON.parse(
  await readFile(
    process.env.QLOO_EVIDENCE_FILE ?? ".work-evidence/production-qloo.json",
    "utf8",
  ),
);
if (source.status !== "PASS" || source.origin !== base)
  throw Error("Fresh live Qloo evidence required");
const anchors = source.results.find((r) => r.step === "resolve").selected;
const candidate = source.results.find((r) => r.step === "discover")
  .candidates[0].entity;
const rows = [];
let cookie, secret, passport;
const json = { "content-type": "application/json", origin: base };
const check = (v, m) => {
  if (!v) throw Error(m);
};
async function account(op, data) {
  const r = await fetch(`${base}/api/account/${op}`, {
    method: "POST",
    headers: { ...json, cookie },
    body: JSON.stringify({ idempotencyKey: randomUUID(), ...data }),
    signal: AbortSignal.timeout(60000),
  });
  const body = await r.json();
  check(
    r.ok && body.status === "available",
    `${op}:${r.status}:${body.code ?? body.status}`,
  );
  return body.data;
}
async function step(name, fn) {
  try {
    const evidence = await fn();
    rows.push({ name, status: "PASS", evidence });
  } catch (e) {
    rows.push({ name, status: "FAIL_REPAIR_REQUIRED", error: e.message });
    throw e;
  }
}
try {
  await step("fresh signup and signin", async () => {
    const email = `prod-acceptance-${randomBytes(8).toString("hex")}@example.test`,
      password = randomBytes(24).toString("base64url");
    const signup = await fetch(base + "/api/auth/sign-up/email", {
      method: "POST",
      headers: json,
      body: JSON.stringify({
        name: "Disposable production acceptance",
        email,
        password,
      }),
      signal: AbortSignal.timeout(30000),
    });
    check(signup.ok, `signup:${signup.status}`);
    const signin = await fetch(base + "/api/auth/sign-in/email", {
      method: "POST",
      headers: json,
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(30000),
    });
    check(signin.ok, `signin:${signin.status}`);
    cookie = signin.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    check(cookie, "Missing session");
    return { signup: signup.status, signin: signin.status };
  });
  await step("real Qloo Passport enrollment", async () => {
    passport = await account("create", {
      displayLabel: "Production acceptance public anchors",
      signalIds: anchors.map((e) => e.id),
      identitiesReviewed: true,
    });
    check(passport.passportRef, "No Passport");
    return {
      passportRef: passport.passportRef,
      stateVersion: passport.stateVersion,
    };
  });
  await step("fresh developer credential", async () => {
    const key = await account("create-key", {
      displayLabel: "Disposable production probe",
      scopes: ["PASSPORT_READ", "TASTE_EVALUATE", "RECEIPT_READ"],
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });
    secret = key.secret;
    check(secret, "No credential");
    return {
      scopes: key.credential?.scopes ?? [
        "PASSPORT_READ",
        "TASTE_EVALUATE",
        "RECEIPT_READ",
      ],
    };
  });
  const client = new TastePolicyClient(base, secret);
  await step("independent SDK passport read", async () => {
    const p = await client.passport({ passportRef: passport.passportRef });
    check(p.passportRef === passport.passportRef, "Wrong Passport");
    return { schemaVersion: p.schemaVersion, stateVersion: p.stateVersion };
  });
  const input = {
    passportRef: passport.passportRef,
    requestedAction: "SUGGEST",
    proposal: {
      agentId: "production-probe",
      expectedStateVersion: passport.stateVersion,
      candidate,
      context: { key: "production-acceptance", domain: "place" },
    },
  };
  await step("independent SDK live cultural decision", async () => {
    const r = await client.evaluate({ ...input, idempotencyKey: randomUUID() });
    check(
      ["ALLOW", "ASK", "REJECT", "UNAVAILABLE"].includes(r.decision),
      "No decision",
    );
    return {
      evaluationRef: r.evaluationRef,
      decision: r.decision,
      receiptRef: r.receiptRef,
      continuation: r.continuation,
    };
  });
  await step("independent A2A live invocation", async () => {
    const r = await fetch(base + "/api/a2a", {
      method: "POST",
      headers: {
        ...json,
        authorization: `Bearer ${secret}`,
        "a2a-version": "1.0",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "SendMessage",
        params: {
          message: {
            messageId: randomUUID(),
            role: "ROLE_USER",
            parts: [
              {
                data: { ...input, idempotencyKey: randomUUID() },
                mediaType: "application/json",
              },
            ],
          },
        },
      }),
      signal: AbortSignal.timeout(60000),
    });
    const body = await r.json();
    check(
      r.ok && body.result?.task?.status?.state === "TASK_STATE_COMPLETED",
      `A2A:${r.status}:${body.error?.message ?? "no completed task"}`,
    );
    const result = body.result.task.artifacts[0].parts[0].data;
    return {
      taskId: body.result.task.id,
      decision: result.decision,
      evaluationRef: result.evaluationRef,
    };
  });
  await step("account export", async () => {
    const data = await account("export", { passportRef: passport.passportRef });
    check(data.exportId, "No export manifest");
    return { exportId: data.exportId, semanticHash: data.semanticHash };
  });
} catch {
  process.exitCode = 1;
} finally {
  if (cookie)
    await step(
      "disposable account deletion and credential invalidation",
      async () => {
        const data = await account("delete-account", {
          confirmation: "DELETE ACCOUNT",
        });
        check(data.deleted, "Not deleted");
        if (secret) {
          const r = await fetch(base + "/api/v1/passport", {
            method: "POST",
            headers: { ...json, authorization: `Bearer ${secret}` },
            body: JSON.stringify({ passportRef: passport?.passportRef }),
            signal: AbortSignal.timeout(30000),
          });
          check(
            r.status === 401 || r.status === 403,
            "Credential survived deletion",
          );
          return { deleted: true, credentialHTTP: r.status };
        }
        return { deleted: true };
      },
    ).catch(() => {
      process.exitCode = 1;
    });
  const output = {
    kind: "LIVE_PRODUCTION",
    origin: base,
    at: new Date().toISOString(),
    status: rows.every((r) => r.status === "PASS")
      ? "PASS"
      : "FAIL_REPAIR_REQUIRED",
    rows,
  };
  await writeFile(
    process.env.EVIDENCE_FILE ?? ".work-evidence/production-authority.json",
    JSON.stringify(output, null, 2) + "\n",
  );
  console.log(JSON.stringify(output, null, 2));
}
