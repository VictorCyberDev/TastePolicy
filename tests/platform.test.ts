// @vitest-environment node
import { beforeAll, afterAll, it, expect, vi } from "vitest";
import {
  platformDatabase,
  account,
  init,
  subjectProvider,
  future,
  entities,
} from "./platform-fixtures";
import { proposal } from "./interactive-fixtures";
import { PlatformService, continuation } from "@/server/platform/service";
let d: Awaited<ReturnType<typeof platformDatabase>>;
beforeAll(async () => {
  d = await platformDatabase();
}, 30000);
afterAll(async () => d?.db.close());
async function fixture() {
  const a = await account(d),
    q = subjectProvider();
  const passport = await d.service.initialize(a.principal, init(), () => q.q);
  return { ...a, q, passport };
}
it("real password signup creates stable identity and private isolated Passport without demo session", async () => {
  const f = await fixture();
  expect(f.passport.visibility).toBe("PRIVATE");
  expect(f.passport).not.toHaveProperty("entries");
  expect(f.passport).not.toHaveProperty("userId");
  expect(
    (
      await d.db.query(
        "SELECT 1 FROM tastepolicy.demo_mutation_sessions WHERE profile_id=$1",
        [f.passport.subjectId],
      )
    ).rows,
  ).toHaveLength(0);
  expect((await d.service.inspect(f.principal)).userId).toBe(
    f.principal.userId,
  );
});
it("logout invalidates real session", async () => {
  const a = await account(d);
  await d.auth.api.signOut({ headers: new Headers({ cookie: a.cookie }) });
  await expect(d.service.inspect(a.principal)).rejects.toMatchObject({
    code: "AUTH_REQUIRED",
  });
});
it("Password authentication rotates sessions and stable user identity", async () => {
  const a = await account(d),
    response = await d.auth.api.signInEmail({
      body: { email: a.email, password: a.password },
      asResponse: true,
    }),
    cookie = response.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; "),
    s = await d.auth.api.getSession({ headers: new Headers({ cookie }) });
  expect(s?.user.id).toBe(a.principal.userId);
  expect(s?.session.id).not.toBe(a.principal.sessionId);
  expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  expect(response.headers.get("set-cookie")).toContain("Secure");
  expect(response.headers.get("set-cookie")).toContain("SameSite=Strict");
});
it("Passport creation retry performs no new identity lookup", async () => {
  const f = await fixture(),
    factory = vi.fn();
  expect(await d.service.initialize(f.principal, init(), factory)).toEqual(
    f.passport,
  );
  expect(factory).not.toHaveBeenCalled();
  await expect(
    d.service.initialize(
      f.principal,
      { ...init(), displayLabel: "Different" },
      factory,
    ),
  ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_CONFLICT" });
});
it("Passport metadata version is immutable", async () => {
  const f = await fixture();
  const updated = await d.service.update(f.principal, {
    idempotencyKey: "u",
    passportRef: f.passport.passportRef,
    expectedPassportVersion: 1,
    displayLabel: "New",
  });
  expect(updated.passportVersion).toBe(2);
  expect(
    (
      await d.store.transaction((r) =>
        r.platform.version(f.passport.passportRef, 1),
      )
    )?.displayLabel,
  ).toBe(f.passport.displayLabel);
});
it("cross-account Passport access requires an active explicit grant", async () => {
  const f = await fixture(),
    b = await account(d);
  await expect(
    d.service.read(b.principal, { passportRef: f.passport.passportRef }),
  ).rejects.toMatchObject({ code: "GRANT_REQUIRED" });
  const grant = await d.service.grant(f.principal, {
    idempotencyKey: "g",
    passportRef: f.passport.passportRef,
    granteeUserId: b.principal.userId,
    scopes: ["READ_PASSPORT_SUMMARY"],
    purpose: "Test",
    expiresAt: future(),
  });
  expect(grant.assurance).toBe("AUTHENTICATED_GRANTOR_CONSENT");
  expect(grant).not.toHaveProperty("profileId");
  expect(
    (
      await d.service.read(b.principal, {
        passportRef: f.passport.passportRef,
        grantId: grant.grantId,
      })
    ).displayLabel,
  ).toBe(f.passport.displayLabel);
  await expect(
    d.service.read(b.principal, {
      passportRef: f.passport.passportRef,
      grantId: grant.grantId,
      stateSummary: true,
    }),
  ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
});
it("grant revoke blocks reads and provider construction", async () => {
  const f = await fixture(),
    b = await account(d),
    g = await d.service.grant(f.principal, {
      idempotencyKey: "g",
      passportRef: f.passport.passportRef,
      granteeUserId: b.principal.userId,
      scopes: ["READ_PASSPORT_SUMMARY", "EVALUATE_TASTE_ACTION"],
      purpose: "Test",
      expiresAt: future(),
    });
  await d.service.revokeGrant(f.principal, {
    idempotencyKey: "r",
    grantId: g.grantId,
  });
  const factory = vi.fn();
  await expect(
    d.service.read(b.principal, {
      passportRef: f.passport.passportRef,
      grantId: g.grantId,
    }),
  ).rejects.toMatchObject({ code: "GRANT_REVOKED" });
  await expect(
    d.service.evaluate(
      b.principal,
      {
        idempotencyKey: "e",
        passportRef: f.passport.passportRef,
        grantId: g.grantId,
        proposal: proposal(1),
      },
      factory,
      entities[0].id,
    ),
  ).rejects.toMatchObject({ code: "GRANT_REVOKED" });
  expect(factory).not.toHaveBeenCalled();
});
it("grant expiry blocks independently from scope", async () => {
  const f = await fixture(),
    b = await account(d),
    g = await d.service.grant(f.principal, {
      idempotencyKey: "g",
      passportRef: f.passport.passportRef,
      granteeUserId: b.principal.userId,
      scopes: ["READ_PASSPORT_SUMMARY"],
      purpose: "Test",
      expiresAt: future(1000),
    });
  await expect(
    new PlatformService(d.store, () => future(2000)).read(b.principal, {
      passportRef: f.passport.passportRef,
      grantId: g.grantId,
    }),
  ).rejects.toMatchObject({ code: "GRANT_EXPIRED" });
});
it("shared evaluation reuses ordinary policy, captures receipt and has no execution authority", async () => {
  const f = await fixture(),
    b = await account(d),
    g = await d.service.grant(f.principal, {
      idempotencyKey: "g",
      passportRef: f.passport.passportRef,
      granteeUserId: b.principal.userId,
      scopes: ["EVALUATE_TASTE_ACTION", "READ_RECEIPT"],
      purpose: "Test",
      expiresAt: future(),
    });
  const result = (await d.service.evaluate(
    b.principal,
    {
      idempotencyKey: "e",
      passportRef: f.passport.passportRef,
      grantId: g.grantId,
      proposal: proposal(1),
    },
    () => f.q.q,
    entities[0].id,
  )) as { decision: string; receiptRef: string; continuation: unknown };
  expect(result.decision).toBe("ALLOW");
  expect(JSON.stringify(result.continuation)).toContain("No purchase");
  const replay = await d.service.receipt(b.principal, {
    evaluationRef: result.receiptRef,
  });
  expect(replay).toHaveProperty("baseEvaluation");
  await d.service.revokeGrant(f.principal, {
    idempotencyKey: "r",
    grantId: g.grantId,
  });
  await expect(
    d.service.receipt(b.principal, { evaluationRef: result.receiptRef }),
  ).rejects.toMatchObject({ code: "GRANT_REVOKED" });
  expect(
    await d.service.receipt(f.principal, { evaluationRef: result.receiptRef }),
  ).toHaveProperty("baseEvaluation");
});
it("developer key stores only hash, shows secret once, and revokes immediately", async () => {
  const f = await fixture(),
    input = {
      idempotencyKey: "key",
      displayLabel: "Test",
      scopes: ["PASSPORT_READ"],
      expiresAt: future(),
    },
    k = await d.service.issueKey(f.principal, input);
  expect(k.secret).toBeTruthy();
  const retry = await d.service.issueKey(f.principal, input);
  expect(retry.secret).toBeUndefined();
  expect(retry.credential).toEqual(k.credential);
  expect(
    JSON.stringify(
      (
        await d.db.query(
          "SELECT * FROM tastepolicy.developer_credentials WHERE user_id=$1",
          [f.principal.userId],
        )
      ).rows,
    ),
  ).not.toContain(k.secret);
  expect(
    JSON.stringify(
      (
        await d.db.query(
          "SELECT * FROM tastepolicy.platform_operations WHERE user_id=$1",
          [f.principal.userId],
        )
      ).rows,
    ),
  ).not.toContain(k.secret);
  const p = await d.service.credentialPrincipal(k.secret!);
  expect(
    await d.service.read(p, { passportRef: f.passport.passportRef }),
  ).toHaveProperty("schemaVersion", "taste-passport-v1");
  await d.service.revokeKey(f.principal, {
    idempotencyKey: "r",
    credentialId: k.credential.credentialId,
  });
  await expect(d.service.credentialPrincipal(k.secret!)).rejects.toMatchObject({
    code: "CREDENTIAL_REVOKED",
  });
});
it("credential expiry and scope are enforced", async () => {
  const f = await fixture(),
    k = await d.service.issueKey(f.principal, {
      idempotencyKey: "key",
      displayLabel: "Test",
      scopes: ["RECEIPT_READ"],
      expiresAt: future(1000),
    }),
    p = await d.service.credentialPrincipal(k.secret!);
  await expect(
    d.service.read(p, { passportRef: f.passport.passportRef }),
  ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  await expect(
    new PlatformService(d.store, () => future(2000)).credentialPrincipal(
      k.secret!,
    ),
  ).rejects.toMatchObject({ code: "CREDENTIAL_EXPIRED" });
});
it("rotation atomically revokes old credential", async () => {
  const f = await fixture(),
    input = {
      idempotencyKey: "key",
      displayLabel: "Test",
      scopes: ["PASSPORT_READ"],
      expiresAt: future(),
    },
    old = await d.service.issueKey(f.principal, input),
    next = await d.service.issueKey(
      f.principal,
      {
        ...input,
        idempotencyKey: "rotate",
        credentialId: old.credential.credentialId,
      },
      true,
    );
  expect(next.secret).toBeTruthy();
  await expect(
    d.service.credentialPrincipal(old.secret!),
  ).rejects.toMatchObject({ code: "CREDENTIAL_REVOKED" });
  expect(await d.service.credentialPrincipal(next.secret!)).toHaveProperty(
    "userId",
    f.principal.userId,
  );
});
it("export separates explicit/provenance material and excludes proxy/group/raw provider data", async () => {
  const f = await fixture(),
    input = { idempotencyKey: "x", passportRef: f.passport.passportRef },
    e = await d.service.export(f.principal, input);
  expect(e.schemaVersion).toBe("taste-passport-export-v1");
  expect(e.explicitUserState.at(-1)?.entries).toHaveLength(5);
  expect(e.providerDerived.rawPayloadsIncluded).toBe(false);
  expect(e.delegateAttestedProxyState.included).toBe(false);
  expect(e.groupAuthorizations.included).toBe(false);
  expect(await d.service.export(f.principal, input)).toEqual(e);
});
it("recent session is required for export and destructive work", async () => {
  const f = await fixture(),
    p = {
      ...f.principal,
      authenticatedAt: new Date(Date.now() - 600000).toISOString(),
    };
  await expect(
    d.service.export(p, {
      idempotencyKey: "x",
      passportRef: f.passport.passportRef,
    }),
  ).rejects.toMatchObject({ code: "RECENT_AUTH_REQUIRED" });
});
it("delete Passport purges state, revokes developer access and denies historical lookup without rewriting decisions", async () => {
  const f = await fixture(),
    k = await d.service.issueKey(f.principal, {
      idempotencyKey: "k",
      displayLabel: "Test",
      scopes: ["PASSPORT_READ"],
      expiresAt: future(),
    });
  await d.service.delete(f.principal, {
    idempotencyKey: "delete",
    passportRef: f.passport.passportRef,
    confirmation: "DELETE PASSPORT",
  });
  expect(
    (
      await d.db.query(
        "SELECT 1 FROM tastepolicy.taste_profiles WHERE profile_id=$1",
        [f.passport.subjectId],
      )
    ).rows,
  ).toHaveLength(0);
  await expect(
    d.service.read(f.principal, { passportRef: f.passport.passportRef }),
  ).rejects.toMatchObject({ code: "PASSPORT_NOT_FOUND" });
  await expect(d.service.credentialPrincipal(k.secret!)).rejects.toMatchObject({
    code: "CREDENTIAL_REVOKED",
  });
});
it("delete account invalidates auth and cascades owned persistent state", async () => {
  const f = await fixture();
  await d.service.delete(
    f.principal,
    {
      idempotencyKey: "delete",
      passportRef: f.passport.passportRef,
      confirmation: "DELETE ACCOUNT",
    },
    true,
  );
  expect(
    await d.auth.api.getSession({ headers: new Headers({ cookie: f.cookie }) }),
  ).toBeNull();
  expect(
    (
      await d.db.query(
        "SELECT 1 FROM tastepolicy.taste_profiles WHERE profile_id=$1",
        [f.passport.subjectId],
      )
    ).rows,
  ).toHaveLength(0);
});
it.each(["ALLOW", "ASK", "REJECT", "UNAVAILABLE"] as const)(
  "continuation %s never grants execution or automatic retries",
  (decision) => {
    const c = continuation(decision);
    expect(c.automaticRetry).toBe(false);
    expect(c.permitted).not.toContain("purchase");
    expect(c.permitted).not.toContain("book");
  },
);
it("concurrent same-key sharing has one canonical immutable grant", async () => {
  const f = await fixture(),
    b = await account(d),
    input = {
      idempotencyKey: "same",
      passportRef: f.passport.passportRef,
      granteeUserId: b.principal.userId,
      scopes: ["READ_PASSPORT_SUMMARY"],
      purpose: "Test",
      expiresAt: future(),
    };
  const results = await Promise.all([
    d.service.grant(f.principal, input),
    d.service.grant(f.principal, input),
  ]);
  expect(results[0]).toEqual(results[1]);
});
it("concurrent metadata writes have one winner and one stale-version failure", async () => {
  const f = await fixture(),
    input = {
      passportRef: f.passport.passportRef,
      expectedPassportVersion: 1,
      displayLabel: "New",
    };
  const results = await Promise.allSettled([
    d.service.update(f.principal, { ...input, idempotencyKey: "a" }),
    d.service.update(f.principal, { ...input, idempotencyKey: "b" }),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
});
it("rotation races cannot mint two active successors", async () => {
  const f = await fixture(),
    input = {
      idempotencyKey: "key",
      displayLabel: "Test",
      scopes: ["PASSPORT_READ"],
      expiresAt: future(),
    },
    k = await d.service.issueKey(f.principal, input);
  const results = await Promise.allSettled([
    d.service.issueKey(
      f.principal,
      {
        ...input,
        idempotencyKey: "a",
        credentialId: k.credential.credentialId,
      },
      true,
    ),
    d.service.issueKey(
      f.principal,
      {
        ...input,
        idempotencyKey: "b",
        credentialId: k.credential.credentialId,
      },
      true,
    ),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
});
it("revocation racing before evaluation denies provider work", async () => {
  const f = await fixture(),
    b = await account(d),
    g = await d.service.grant(f.principal, {
      idempotencyKey: "g",
      passportRef: f.passport.passportRef,
      granteeUserId: b.principal.userId,
      scopes: ["EVALUATE_TASTE_ACTION"],
      purpose: "Test",
      expiresAt: future(),
    }),
    factory = vi.fn(() => f.q.q);
  const results = await Promise.allSettled([
    d.service.revokeGrant(f.principal, {
      idempotencyKey: "r",
      grantId: g.grantId,
    }),
    d.service.evaluate(
      b.principal,
      {
        idempotencyKey: "e",
        passportRef: f.passport.passportRef,
        grantId: g.grantId,
        proposal: proposal(1),
      },
      factory,
      entities[0].id,
    ),
  ]);
  expect(results[0].status).toBe("fulfilled");
  expect(results[1].status).toBe("rejected");
  expect(factory).not.toHaveBeenCalled();
});
it("deletion racing before new evaluation fails closed", async () => {
  const f = await fixture(),
    factory = vi.fn(() => f.q.q);
  const results = await Promise.allSettled([
    d.service.delete(f.principal, {
      idempotencyKey: "d",
      passportRef: f.passport.passportRef,
      confirmation: "DELETE PASSPORT",
    }),
    d.service.evaluate(
      f.principal,
      {
        idempotencyKey: "e",
        passportRef: f.passport.passportRef,
        proposal: proposal(1),
      },
      factory,
      entities[0].id,
    ),
  ]);
  expect(results[1].status).toBe("rejected");
  expect(factory).not.toHaveBeenCalled();
});
it("cross-account export, deletion, grant/key revocation and rotation are denied", async () => {
  const a = await fixture(),
    b = await fixture(),
    g = await d.service.grant(a.principal, {
      idempotencyKey: "g",
      passportRef: a.passport.passportRef,
      granteeUserId: b.principal.userId,
      scopes: ["READ_PASSPORT_SUMMARY"],
      purpose: "Test",
      expiresAt: future(),
    }),
    k = await d.service.issueKey(a.principal, {
      idempotencyKey: "k",
      displayLabel: "Test",
      scopes: ["PASSPORT_READ"],
      expiresAt: future(),
    });
  await expect(
    d.service.export(b.principal, {
      idempotencyKey: "x",
      passportRef: a.passport.passportRef,
    }),
  ).rejects.toMatchObject({ code: "PASSPORT_NOT_FOUND" });
  await expect(
    d.service.delete(b.principal, {
      idempotencyKey: "d",
      passportRef: a.passport.passportRef,
      confirmation: "DELETE PASSPORT",
    }),
  ).rejects.toMatchObject({ code: "PASSPORT_NOT_FOUND" });
  await expect(
    d.service.revokeGrant(b.principal, {
      idempotencyKey: "r",
      grantId: g.grantId,
    }),
  ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  await expect(
    d.service.revokeKey(b.principal, {
      idempotencyKey: "r",
      credentialId: k.credential.credentialId,
    }),
  ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  await expect(
    d.service.issueKey(
      b.principal,
      {
        idempotencyKey: "rotate",
        credentialId: k.credential.credentialId,
        displayLabel: "No",
        scopes: ["PASSPORT_READ"],
        expiresAt: future(),
      },
      true,
    ),
  ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
});
it("API principal cannot create grants, keys, export or delete", async () => {
  const f = await fixture(),
    k = await d.service.issueKey(f.principal, {
      idempotencyKey: "k",
      displayLabel: "Test",
      scopes: ["PASSPORT_READ", "TASTE_EVALUATE", "RECEIPT_READ"],
      expiresAt: future(),
    }),
    p = await d.service.credentialPrincipal(k.secret!);
  await expect(
    d.service.export(p, {
      idempotencyKey: "x",
      passportRef: f.passport.passportRef,
    }),
  ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  await expect(
    d.service.delete(p, {
      idempotencyKey: "d",
      passportRef: f.passport.passportRef,
      confirmation: "DELETE PASSPORT",
    }),
  ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
});
it("credential checked again immediately before provider work", async () => {
  const f = await fixture(),
    k = await d.service.issueKey(f.principal, {
      idempotencyKey: "k",
      displayLabel: "Test",
      scopes: ["TASTE_EVALUATE"],
      expiresAt: future(),
    }),
    p = await d.service.credentialPrincipal(k.secret!),
    factory = vi.fn();
  await d.service.revokeKey(f.principal, {
    idempotencyKey: "r",
    credentialId: k.credential.credentialId,
  });
  await expect(
    d.service.evaluate(
      p,
      {
        idempotencyKey: "e",
        passportRef: f.passport.passportRef,
        proposal: proposal(1),
      },
      factory,
      entities[0].id,
    ),
  ).rejects.toMatchObject({ code: "CREDENTIAL_REVOKED" });
  expect(factory).not.toHaveBeenCalled();
});
it("API credentials share a persisted bounded owner request quota", async () => {
  const f = await fixture(),
    k = await d.service.issueKey(f.principal, {
      idempotencyKey: "k",
      displayLabel: "Test",
      scopes: ["PASSPORT_READ"],
      expiresAt: future(),
    });
  for (let i = 0; i < 30; i++) await d.service.credentialPrincipal(k.secret!);
  await expect(d.service.credentialPrincipal(k.secret!)).rejects.toMatchObject({
    code: "RATE_LIMITED",
  });
});
it("evaluation retry precedes provider and changed payload conflicts", async () => {
  const f = await fixture(),
    input = {
      idempotencyKey: "e",
      passportRef: f.passport.passportRef,
      proposal: proposal(1),
    },
    first = await d.service.evaluate(
      f.principal,
      input,
      () => f.q.q,
      entities[0].id,
    ),
    factory = vi.fn();
  expect(
    await d.service.evaluate(f.principal, input, factory, entities[0].id),
  ).toEqual(first);
  expect(factory).not.toHaveBeenCalled();
  await expect(
    d.service.evaluate(
      f.principal,
      { ...input, proposal: { ...proposal(1), agentId: "Different" } },
      factory,
      entities[0].id,
    ),
  ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_CONFLICT" });
});
it("state freshness rejects stale platform requests before provider construction", async () => {
  const f = await fixture(),
    factory = vi.fn();
  await expect(
    d.service.evaluate(
      f.principal,
      {
        idempotencyKey: "e",
        passportRef: f.passport.passportRef,
        proposal: proposal(0),
      },
      factory,
      entities[0].id,
    ),
  ).rejects.toMatchObject({ code: "STATE_VERSION_CONFLICT" });
  expect(factory).not.toHaveBeenCalled();
});
it("export rollback leaves neither manifest nor operation record", async () => {
  const f = await fixture(),
    store = {
      transaction: <T>(fn: Parameters<typeof d.store.transaction<T>>[0]) =>
        d.store.transaction((r) =>
          fn({
            ...r,
            platform: {
              ...r.platform,
              exports: async (...args) => {
                await r.platform.exports(...args);
                throw Error("injected");
              },
            },
          }),
        ),
    };
  await expect(
    new PlatformService(store).export(f.principal, {
      idempotencyKey: "x",
      passportRef: f.passport.passportRef,
    }),
  ).rejects.toThrow("injected");
  expect(
    (
      await d.db.query(
        "SELECT 1 FROM tastepolicy.passport_exports WHERE user_id=$1",
        [f.principal.userId],
      )
    ).rows,
  ).toHaveLength(0);
  expect(
    await d.store.transaction((r) =>
      r.platform.op(f.principal.userId, "export", "x"),
    ),
  ).toBeNull();
});
it("provider-backed evaluation rollback leaves no partial state receipt", async () => {
  const f = await fixture(),
    store = {
      transaction: <T>(fn: Parameters<typeof d.store.transaction<T>>[0]) =>
        d.store.transaction((r) =>
          fn({
            ...r,
            platform: {
              ...r.platform,
              evaluation: async (e) => {
                await r.platform.evaluation(e);
                throw Error("injected");
              },
            },
          }),
        ),
    };
  await expect(
    new PlatformService(store).evaluate(
      f.principal,
      {
        idempotencyKey: "e",
        passportRef: f.passport.passportRef,
        proposal: proposal(1),
      },
      () => f.q.q,
      entities[0].id,
    ),
  ).rejects.toThrow("injected");
  expect(
    (
      await d.db.query(
        "SELECT 1 FROM tastepolicy.cultural_receipts WHERE profile_id=$1",
        [f.passport.subjectId],
      )
    ).rows,
  ).toHaveLength(0);
});
it("SQL ownership prevents wrong-user grant and credential revocation", async () => {
  const a = await fixture(),
    b = await fixture(),
    g = await d.service.grant(a.principal, {
      idempotencyKey: "g",
      passportRef: a.passport.passportRef,
      granteeUserId: b.principal.userId,
      scopes: ["READ_PASSPORT_SUMMARY"],
      purpose: "Test",
      expiresAt: future(),
    }),
    k = await d.service.issueKey(a.principal, {
      idempotencyKey: "k",
      displayLabel: "Test",
      scopes: ["PASSPORT_READ"],
      expiresAt: future(),
    });
  await expect(
    d.db.query(
      "INSERT INTO tastepolicy.passport_access_events VALUES($1,$2,'{}')",
      [g.grantId, b.principal.userId],
    ),
  ).rejects.toMatchObject({ code: "23503" });
  await expect(
    d.db.query(
      "INSERT INTO tastepolicy.developer_credential_events VALUES($1,$2,'{}')",
      [b.principal.userId, k.credential.credentialId],
    ),
  ).rejects.toMatchObject({ code: "23503" });
});
it("SQL revocation cannot be removed to resurrect a grant", async () => {
  const a = await fixture(),
    b = await fixture(),
    g = await d.service.grant(a.principal, {
      idempotencyKey: "g",
      passportRef: a.passport.passportRef,
      granteeUserId: b.principal.userId,
      scopes: ["READ_PASSPORT_SUMMARY"],
      purpose: "Test",
      expiresAt: future(),
    });
  await d.service.revokeGrant(a.principal, {
    idempotencyKey: "r",
    grantId: g.grantId,
  });
  await expect(
    d.db.query(
      "DELETE FROM tastepolicy.passport_access_events WHERE grant_id=$1",
      [g.grantId],
    ),
  ).rejects.toThrow("Immutable grant revocation");
  await expect(
    d.db.query(
      "UPDATE tastepolicy.passport_access_grants SET expires_at=now()+interval '1 year' WHERE grant_id=$1",
      [g.grantId],
    ),
  ).rejects.toThrow("Immutable snapshot");
});
it("all M6 tables enable RLS and revoke PUBLIC privileges", async () => {
  const rows = (
    await d.db.query<{ relrowsecurity: boolean; public_access: boolean }>(
      "SELECT c.relrowsecurity,EXISTS(SELECT 1 FROM aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee=0) public_access FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='tastepolicy' AND c.relname IN ('platform_auth_user','platform_auth_session','platform_auth_account','platform_auth_verification','rateLimit','platform_ownership','taste_passports','passport_versions','passport_access_grants','passport_access_events','developer_credentials','developer_credential_events','platform_evaluations','platform_operations','passport_exports','platform_rate','account_deletion_records')",
    )
  ).rows;
  expect(rows).toHaveLength(17);
  expect(rows.every((r) => r.relrowsecurity && !r.public_access)).toBe(true);
});
it("M5 permission assurance and modeled provenance remain unchanged", async () => {
  const { ProxyService } = await import("@/server/subjects/proxy-service"),
    { setup, NOW, reqId } = await import("./interactive-fixtures"),
    { createProxy } = await import("./subjects-fixtures"),
    a = await setup(d.store),
    s = new ProxyService(d.store, () => NOW),
    p = await s.create(
      a.token,
      createProxy(),
      () => subjectProvider().q,
      reqId,
    );
  expect(p.permission.assuranceLevel).toBe("USER_ATTESTED_PERMISSION");
  const provenance = await d.store.transaction((r) =>
    r.subjects.anchorProvenance(
      p.subject.ownerProfileId,
      p.subject.subjectId,
      1,
    ),
  );
  expect(provenance?.source).toBe("DELEGATE_ATTESTED");
});
it("filesystem reopen preserves authentication, grants, Passport and captured replay", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises"),
    { tmpdir } = await import("node:os"),
    { join } = await import("node:path"),
    dir = await mkdtemp(join(tmpdir(), "tastepolicy-m6-"));
  let local = await platformDatabase(dir);
  try {
    const a = await account(local),
      q = subjectProvider(),
      p = await local.service.initialize(a.principal, init(), () => q.q),
      e = (await local.service.evaluate(
        a.principal,
        {
          idempotencyKey: "e",
          passportRef: p.passportRef,
          proposal: proposal(1),
        },
        () => q.q,
        entities[0].id,
      )) as { receiptRef: string },
      authSecret = local.authSecret;
    await local.db.close();
    local = await platformDatabase(dir, false, authSecret);
    expect(
      (
        await local.auth.api.getSession({
          headers: new Headers({ cookie: a.cookie }),
        })
      )?.user.id,
    ).toBe(a.principal.userId);
    expect(
      (await local.service.read(a.principal, { passportRef: p.passportRef }))
        .stateHash,
    ).toBe(p.stateHash);
    expect(
      await local.service.receipt(a.principal, { evaluationRef: e.receiptRef }),
    ).toHaveProperty("baseEvaluation");
  } finally {
    await local.db.close();
    await rm(dir, { recursive: true, force: true });
  }
}, 30000);
it("export semantic material detects modified immutable state snapshots", async () => {
  const f = await fixture(),
    store = {
      transaction: <T>(fn: Parameters<typeof d.store.transaction<T>>[0]) =>
        d.store.transaction((r) =>
          fn({
            ...r,
            platform: {
              ...r.platform,
              versions: async (p) =>
                (await r.platform.versions(p)).map((s) => ({
                  ...s,
                  stateHash: "0".repeat(64),
                })),
            },
          }),
        ),
    };
  await expect(
    new PlatformService(store).export(f.principal, {
      idempotencyKey: "x",
      passportRef: f.passport.passportRef,
    }),
  ).rejects.toMatchObject({ code: "INTEGRITY_ERROR" });
});
it("direct account deletion cascades shares, keys and records while preserving unrelated accounts", async () => {
  const a = await fixture(),
    b = await fixture(),
    g = await d.service.grant(a.principal, {
      idempotencyKey: "g",
      passportRef: a.passport.passportRef,
      granteeUserId: b.principal.userId,
      scopes: ["READ_PASSPORT_SUMMARY"],
      purpose: "Test",
      expiresAt: future(),
    });
  await d.service.revokeGrant(a.principal, {
    idempotencyKey: "r",
    grantId: g.grantId,
  });
  await d.service.delete(
    a.principal,
    {
      idempotencyKey: "d",
      passportRef: a.passport.passportRef,
      confirmation: "DELETE ACCOUNT",
    },
    true,
  );
  expect(
    (await d.service.read(b.principal, { passportRef: b.passport.passportRef }))
      .stateHash,
  ).toBe(b.passport.stateHash);
  expect(
    (
      await d.db.query(
        "SELECT 1 FROM tastepolicy.passport_access_grants WHERE grant_id=$1",
        [g.grantId],
      )
    ).rows,
  ).toHaveLength(0);
});
it("a demo capability never establishes an authenticated account session", async () => {
  expect(
    await d.auth.api.getSession({
      headers: new Headers({ cookie: "tastepolicy_demo=" + "a".repeat(64) }),
    }),
  ).toBeNull();
});
it("platform evaluation preserves the ordinary provider budget and UNAVAILABLE semantics", async () => {
  const f = await fixture(),
    before = f.q.calls.length,
    input = {
      idempotencyKey: "e",
      passportRef: f.passport.passportRef,
      proposal: proposal(1),
    };
  await d.service.evaluate(f.principal, input, () => f.q.q, entities[0].id);
  expect(f.q.calls.length - before).toBe(2);
  const failure = (await d.service.evaluate(
    f.principal,
    { ...input, idempotencyKey: "unavailable" },
    () => {
      throw Error("private provider error");
    },
    entities[0].id,
  )) as { decision: string; continuation: { automaticRetry: boolean } };
  expect(failure.decision).toBe("UNAVAILABLE");
  expect(failure.continuation.automaticRetry).toBe(false);
  expect(JSON.stringify(failure)).not.toContain("private provider error");
});
it("account Passport purge removes attached isolated M5 proxy lineages without orphan states", async () => {
  const f = await fixture(),
    { randomUUID } = await import("node:crypto"),
    { stateHash } = await import("@/server/state/service"),
    { self, writeAnchors, versionGroup } =
      await import("@/server/subjects/common"),
    proxyId = randomUUID(),
    subjectId = randomUUID();
  await d.store.transaction(async (r) => {
    const p = (await r.states.profile(f.passport.subjectId))!;
    await self(r, p);
    await r.states.create({ ...p, profileId: proxyId, currentStateVersion: 0 });
    await r.states.insertVersion({
      profileId: proxyId,
      stateVersion: 0,
      parentVersion: null,
      mutationId: null,
      entries: [],
      stateHash: stateHash([]),
      createdAt: p.createdAt,
    });
    const s = {
      ownerProfileId: p.profileId,
      subjectId,
      subjectKind: "PROXY" as const,
      stateProfileId: proxyId,
      displayLabel: "SYNTHETIC TEST DATA",
      createdAt: p.createdAt,
      expiresAt: p.expiresAt,
    };
    await r.subjects.insert(s);
    const attestationId = randomUUID();
    await r.subjects.grant({
      ownerProfileId: p.profileId,
      subjectId,
      attestationId,
      assuranceLevel: "USER_ATTESTED_PERMISSION",
      scopes: ["MODEL_MANAGEMENT", "TASTE_EVALUATION", "GROUP_EVALUATION"],
      attestedAt: p.createdAt,
      expiresAt: p.expiresAt,
      provenance: "DELEGATE_ATTESTED",
      requestId: randomUUID(),
    });
    await writeAnchors(
      r,
      s,
      entities.slice(0, 5),
      p.createdAt,
      attestationId,
      "synthetic-init",
    );
    const g = {
      ownerProfileId: p.profileId,
      groupId: randomUUID(),
      displayLabel: "SYNTHETIC TEST DATA",
      currentVersion: 1,
    };
    await r.groups.insert(g);
    await versionGroup(r, p, g.groupId, [p.profileId, subjectId], p.createdAt);
  });
  await d.service.delete(f.principal, {
    idempotencyKey: "d",
    passportRef: f.passport.passportRef,
    confirmation: "DELETE PASSPORT",
  });
  expect(
    (
      await d.db.query(
        "SELECT 1 FROM tastepolicy.taste_profiles WHERE profile_id=$1",
        [proxyId],
      )
    ).rows,
  ).toHaveLength(0);
  expect(
    (
      await d.db.query(
        "SELECT 1 FROM tastepolicy.taste_groups WHERE owner_profile_id=$1",
        [f.passport.subjectId],
      )
    ).rows,
  ).toHaveLength(0);
});
it("SQL rejects credential and consent JSON that contradict relational ownership", async () => {
  const a = await fixture(),
    b = await fixture(),
    { randomUUID } = await import("node:crypto"),
    k = await d.service.issueKey(a.principal, {
      idempotencyKey: "k",
      displayLabel: "Test",
      scopes: ["PASSPORT_READ"],
      expiresAt: future(),
    }),
    cid = randomUUID();
  await expect(
    d.db.query(
      "INSERT INTO tastepolicy.developer_credentials VALUES($1,$2,$3,$4,$5,$6)",
      [
        cid,
        a.principal.userId,
        "f".repeat(64),
        k.credential.scopes,
        k.credential.expiresAt,
        { ...k.credential, credentialId: cid, userId: b.principal.userId },
      ],
    ),
  ).rejects.toMatchObject({ code: "23514" });
  const gid = randomUUID(),
    expiresAt = future();
  await expect(
    d.db.query(
      "INSERT INTO tastepolicy.passport_access_grants VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        gid,
        a.principal.userId,
        a.passport.passportRef,
        a.passport.subjectId,
        b.principal.userId,
        ["READ_PASSPORT_SUMMARY"],
        expiresAt,
        {
          schemaVersion: "taste-passport-grant-v1",
          grantId: gid,
          grantorUserId: b.principal.userId,
          granteeUserId: b.principal.userId,
          passportRef: a.passport.passportRef,
          profileId: a.passport.subjectId,
          scopes: ["READ_PASSPORT_SUMMARY"],
          expiresAt,
          assurance: "AUTHENTICATED_GRANTOR_CONSENT",
        },
      ],
    ),
  ).rejects.toMatchObject({ code: "23514" });
});
