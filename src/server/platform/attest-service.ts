import "server-only";
import { importJWK, type JWK } from "jose";
import { LeaseService } from "./lease-service";
import { attestationConfig, type AttestationConfig } from "./attest-config";
import { leaseRef as parseLeaseRef } from "./lease-service";
import { platformFail as fail, type Principal } from "@/lib/platform/types";
import { object } from "@/server/subjects/common";
import { issueAttestation, newJti, signStatusList } from "@/lib/attest/issue";
import { STATUS } from "@/lib/attest/status-list";
import { verifyPresentation, type VerifyResult } from "@/lib/attest/verify";
import { safeFetchText } from "@/lib/attest/safe-fetch";
import type { Repositories, StateStore } from "@/server/state/repositories";

const AUD = /^https:\/\/[a-z0-9.-]{1,190}(:\d{1,5})?$/;
const AGENT = /^[a-zA-Z0-9_-]{1,64}$/;
const toSeconds = (iso: string) => Math.floor(Date.parse(iso) / 1000);

export class AttestationService extends LeaseService {
  constructor(
    store: StateStore,
    clock = () => new Date().toISOString(),
    private readonly config: () => Promise<AttestationConfig | null> = attestationConfig,
    // Fetches a status list of another issuer; overridable in tests.
    private readonly remote: (uri: string) => Promise<string> = (uri) =>
      safeFetchText(uri, "application/statuslist+jwt"),
  ) {
    super(store, clock);
  }
  private async cfg() {
    const c = await this.config();
    if (!c) fail("NOT_CONFIGURED");
    return c;
  }
  private statusUri(c: AttestationConfig, listId: number) {
    return `${c.issuer}/api/attest/status/${listId}`;
  }
  // Issue a presentable proof of an ACTIVE lease for one named audience.
  async attestationIssue(p: Principal, raw: unknown) {
    const v = object(raw, [
        "leaseRef",
        "audience",
        "holderKey",
        "delegateAgentId",
      ]),
      ref = parseLeaseRef(v.leaseRef);
    if (typeof v.audience !== "string" || !AUD.test(v.audience))
      fail("INVALID_INPUT");
    const audience = v.audience as string;
    let holderKey: JWK | undefined;
    if (v.holderKey !== undefined) {
      const k = v.holderKey as JWK;
      if (
        !k ||
        typeof k !== "object" ||
        "d" in k ||
        "p" in k ||
        "k" in k ||
        !(
          (k.kty === "EC" && k.crv === "P-256") ||
          (k.kty === "OKP" && k.crv === "Ed25519")
        )
      )
        fail("INVALID_INPUT");
      try {
        await importJWK(k, k.kty === "EC" ? "ES256" : "Ed25519");
      } catch {
        fail("INVALID_INPUT");
      }
      holderKey =
        k.kty === "EC"
          ? { kty: k.kty, crv: k.crv, x: k.x, y: k.y }
          : { kty: k.kty, crv: k.crv, x: k.x };
    }
    const delegate = v.delegateAgentId;
    if (
      delegate !== undefined &&
      (typeof delegate !== "string" || !AGENT.test(delegate) || !holderKey)
    )
      fail("INVALID_INPUT");
    const cfg = await this.cfg();
    return this.store.transaction(async (r) => {
      const l0 = await r.leases.get(ref, true);
      if (!l0 || l0.actorId !== p.userId) fail("LEASE_NOT_FOUND");
      await this.agentAccess(r, p, l0, "TASTE_EVALUATE");
      if (
        !(await r.platform.rate(
          p.userId,
          "attest:" + this.clock().slice(0, 13),
          120,
        ))
      )
        fail("RATE_LIMITED");
      const l = await this.settle(r, l0);
      if (l.state.status !== "ACTIVE") fail("LEASE_STATE_CONFLICT");
      const passport = await r.platform.passport(l.passportRef);
      if (!passport) fail("PASSPORT_NOT_FOUND");
      const entry =
        (await r.attest.entry(l.leaseRef)) ??
        (await r.attest.allocate(l.leaseRef, STATUS.VALID));
      const now = toSeconds(this.clock()),
        jti = newJti();
      const issued = await issueAttestation(
        {
          issuer: cfg.issuer,
          audience,
          now,
          leaseExpiresAt: toSeconds(l.state.expiresAt),
          jti,
          statusUri: this.statusUri(cfg, entry.listId),
          statusIdx: entry.idx,
          holderKey,
          disclosable: {
            decision: "ALLOW",
            permitted: l.permitted,
            candidate_id: l.candidateId,
            candidate_name: l.candidateName,
            context_key: l.contextKey,
            agent_id: delegate ?? l.agentId,
            lease_ref: l.leaseRef,
            subject_ref: passport.subjectRef,
            policy: { version: l.state.fingerprint.policyVersion },
            ...(delegate ? { act: { agent_id: l.agentId } } : {}),
          },
        },
        cfg.signer,
      );
      await r.attest.insert({
        jti,
        leaseRef: l.leaseRef,
        audience,
        issuedAt: this.clock(),
        expiresAt: new Date(issued.exp * 1000).toISOString(),
        holderBound: !!holderKey,
        delegatedTo: delegate ?? null,
      });
      return {
        schemaVersion: "taste-attestation-v1",
        attestation: issued.compact,
        jti,
        audience,
        expiresAt: new Date(issued.exp * 1000).toISOString(),
        holderBound: !!holderKey,
        disclosable: issued.disclosures.map((d) => d.name),
        statusUri: this.statusUri(cfg, entry.listId),
        note: "Present only the claims the verifier needs. Authority is cultural only; the lease, not this token, is the authority and may end at any time.",
      };
    });
  }
  // Public: sign the current status list for serving.
  async statusListToken(listId: number): Promise<string | null> {
    const cfg = await this.cfg();
    return this.store.transaction(async (r) => {
      const list = await r.attest.list(listId);
      if (!list) return null;
      return signStatusList(
        {
          issuer: cfg.issuer,
          uri: this.statusUri(cfg, listId),
          now: toSeconds(this.clock()),
          ttlSeconds: 60,
          bits: 2,
          list,
        },
        cfg.signer,
      );
    });
  }
  // Public hosted verifier for relying parties that prefer an API.
  async attestationVerify(
    raw: unknown,
  ): Promise<VerifyResult & { dryRun: boolean }> {
    const v = object(raw, ["presentation", "audience", "nonce", "dryRun"]);
    if (
      typeof v.presentation !== "string" ||
      v.presentation.length > 16384 ||
      typeof v.audience !== "string" ||
      !AUD.test(v.audience) ||
      (v.nonce !== undefined &&
        (typeof v.nonce !== "string" || v.nonce.length > 200)) ||
      (v.dryRun !== undefined && typeof v.dryRun !== "boolean")
    )
      fail("INVALID_INPUT");
    const cfg = await this.cfg(),
      dryRun = v.dryRun === true,
      now = toSeconds(this.clock());
    // Status lists of this issuer are read locally; others through the SSRF-safe fetcher.
    const ownPrefix = `${cfg.issuer}/api/attest/status/`;
    const fetchStatus = async (uri: string) => {
      if (uri.startsWith(ownPrefix)) {
        const id = Number(uri.slice(ownPrefix.length));
        const t = Number.isInteger(id) ? await this.statusListToken(id) : null;
        if (!t) throw Error("NO_LIST");
        return t;
      }
      return this.remote(uri);
    };
    const result = await verifyPresentation(v.presentation as string, {
      audience: v.audience as string,
      trustedIssuers: cfg.trusted,
      now: () => now,
      nonce: v.nonce as string | undefined,
      fetchStatus,
      // A separate short transaction at the very end: a rejected presentation
      // never records its jti, and nothing is nested.
      consumeJti: dryRun
        ? undefined
        : (jti, aud) =>
            this.store.transaction((r) =>
              r.attest.consume(jti, aud, this.clock()),
            ),
    });
    // Only disclosed claims are returned; nothing else about the lease or person.
    return { ...result, dryRun };
  }
  // The owner sees which proofs were issued, for whom, and until when.
  override async leaseList(p: Principal, raw: unknown) {
    const base = await super.leaseList(p, raw);
    const issued = await this.store.transaction((r) =>
      r.attest.forPassport(base.passportRef),
    );
    return {
      ...base,
      attestations: issued.map(({ jti, ...rest }) => ({
        ...rest,
        ref: jti.slice(0, 8),
      })),
    };
  }
  async purgeReplays() {
    return this.store.transaction((r) =>
      r.attest.purgeReplays(
        new Date(Date.parse(this.clock()) - 2 * 86_400_000).toISOString(),
      ),
    );
  }
  async attestationsFor(r: Repositories, leaseRef: string) {
    return r.attest.forLease(leaseRef);
  }
}
