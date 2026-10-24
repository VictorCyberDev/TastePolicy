// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- assertions over loosely typed JSON responses */
import { spawnSync } from "node:child_process";
import { afterEach, it, expect } from "vitest";
import { calculateJwkThumbprint, exportJWK, generateKeyPair } from "jose";
import { attestationConfig } from "@/server/platform/attest-config";
import { GET as metadataRoute } from "@/app/.well-known/tastepolicy-issuer/route";
import { validateIssuerMetadata } from "@/lib/attest/issuer-metadata";

const KEYS = [
  "TASTEPOLICY_PUBLIC_ORIGIN",
  "TASTEPOLICY_ATTESTATION_KEY",
  "TASTEPOLICY_ATTESTATION_NEXT_PUBLIC_KEY",
  "TASTEPOLICY_ATTESTATION_PREVIOUS_PUBLIC_KEYS",
  "TASTEPOLICY_ATTESTATION_REVOKED_KIDS",
  "TASTEPOLICY_TRUSTED_ISSUERS",
];
afterEach(() => KEYS.forEach((k) => delete process.env[k]));
async function pair() {
  const { publicKey, privateKey } = await generateKeyPair("ES256", {
    extractable: true,
  });
  const pub = await exportJWK(publicKey);
  return {
    pub,
    priv: await exportJWK(privateKey),
    kid: await calculateJwkThumbprint(pub),
  };
}
const origin = "https://issuer.example";

it("key lifecycle: the next key is published ahead of the switch, retired keys stay, a compromised kid is removed and announced", async () => {
  const active = await pair(),
    next = await pair(),
    old = await pair(),
    bad = await pair();
  process.env.TASTEPOLICY_PUBLIC_ORIGIN = origin;
  process.env.TASTEPOLICY_ATTESTATION_KEY = JSON.stringify(active.priv);
  process.env.TASTEPOLICY_ATTESTATION_NEXT_PUBLIC_KEY = JSON.stringify(
    next.pub,
  );
  process.env.TASTEPOLICY_ATTESTATION_PREVIOUS_PUBLIC_KEYS = JSON.stringify({
    keys: [
      { ...old.pub, kid: old.kid },
      { ...bad.pub, kid: bad.kid },
    ],
  });
  process.env.TASTEPOLICY_ATTESTATION_REVOKED_KIDS = bad.kid;
  const cfg = (await attestationConfig())!;
  const kids = cfg.jwks.keys.map((k) => k.kid);
  expect(kids).toEqual([active.kid, next.kid, old.kid]);
  expect(cfg.signer.kid).toBe(active.kid);
  expect(cfg.keys).toMatchObject({
    active: active.kid,
    next: [next.kid],
    revoked: [bad.kid],
  });
  expect(cfg.trusted[origin].revokedKids).toEqual([bad.kid]);
  expect(JSON.stringify(cfg.jwks)).not.toContain('"d"');
  // the signing key itself cannot be both active and revoked
  process.env.TASTEPOLICY_ATTESTATION_REVOKED_KIDS = active.kid;
  expect(await attestationConfig()).toBeNull();
  // a private "next" key is refused
  process.env.TASTEPOLICY_ATTESTATION_REVOKED_KIDS = "";
  process.env.TASTEPOLICY_ATTESTATION_NEXT_PUBLIC_KEY = JSON.stringify(
    next.priv,
  );
  expect(await attestationConfig()).toBeNull();
});

it("issuer metadata is served from configuration, validates, and says discovery grants no trust", async () => {
  const active = await pair();
  process.env.TASTEPOLICY_PUBLIC_ORIGIN = origin;
  process.env.TASTEPOLICY_ATTESTATION_KEY = JSON.stringify(active.priv);
  const res = await metadataRoute();
  expect(res.status).toBe(200);
  const m: any = await res.json();
  expect(
    validateIssuerMetadata(m, origin + "/.well-known/tastepolicy-issuer"),
  ).toEqual([]);
  expect(m.keys.active).toBe(active.kid);
  expect(m.trust.discoveryGrantsTrust).toBe(false);
  expect(m.supportedActions).toEqual(["recommend", "add_to_draft"]);
  expect(JSON.stringify(m)).not.toContain('"d"');
  delete process.env.TASTEPOLICY_ATTESTATION_KEY;
  expect((await metadataRoute()).status).toBe(404);
});

it("trusted issuer entries accept states and revoked kids and reject malformed ones", async () => {
  const active = await pair(),
    other = await pair();
  process.env.TASTEPOLICY_PUBLIC_ORIGIN = origin;
  process.env.TASTEPOLICY_ATTESTATION_KEY = JSON.stringify(active.priv);
  const entry = (extra: object) =>
    JSON.stringify({
      "https://other.example": {
        jwks: { keys: [{ ...other.pub, kid: other.kid }] },
        vct: ["v"],
        ...extra,
      },
    });
  process.env.TASTEPOLICY_TRUSTED_ISSUERS = entry({
    state: "REVOKED",
    revokedKids: [other.kid],
  });
  expect(
    (await attestationConfig())!.trusted["https://other.example"].state,
  ).toBe("REVOKED");
  process.env.TASTEPOLICY_TRUSTED_ISSUERS = entry({ state: "FRIENDLY" });
  expect(await attestationConfig()).toBeNull();
  process.env.TASTEPOLICY_TRUSTED_ISSUERS = entry({ revokedKids: [1] });
  expect(await attestationConfig()).toBeNull();
});

it("the TastePolicy Compatible v1 report passes against the reference adapter", () => {
  const r = spawnSync("npm", ["run", "--silent", "conformance:compatible"], {
    encoding: "utf8",
    env: { ...process.env, NODE_NO_WARNINGS: "1" },
  });
  expect(r.stdout).toContain("ALL ");
  expect(r.status).toBe(0);
}, 60000);
