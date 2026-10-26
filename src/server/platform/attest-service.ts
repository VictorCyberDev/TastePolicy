import "server-only";
import { importJWK, type JWK } from "jose";
import { LeaseService, legacyWords } from "./lease-service";
import { attestationConfig, type AttestationConfig } from "./attest-config";
import { leaseRef as parseLeaseRef } from "./lease-service";
import { platformFail as fail, type Principal } from "@/lib/platform/types";
import { object } from "@/server/subjects/common";
import { epochCommitment, epochRef } from "./attest-epoch";
import { issueAttestation, newJti, signStatusList } from "@/lib/attest/issue";
import { STATUS } from "@/lib/attest/status-list";
import { buildAuthorityTimeline } from "@/lib/timeline/authority-timeline";
import { presentedCommitments } from "@/lib/commit/commitments";
import { verifyPresentation, type VerifyResult } from "@/lib/attest/verify";
import { safeFetchText } from "@/lib/attest/safe-fetch";
import type { Repositories, StateStore } from "@/server/state/repositories";

const statusMemo = new Map<
  string,
  { token: string; at: number; version: string }
>();
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
        !(k.kty === "EC" && k.crv === "P-256")
      )
        fail("INVALID_INPUT");
      // P-256 only: the point is validated on-curve by the crypto library.
      try {
        await importJWK(k, "ES256");
      } catch {
        fail("INVALID_INPUT");
      }
      holderKey = { kty: k.kty, crv: k.crv, x: k.x, y: k.y };
    }
    const delegate = v.delegateAgentId;
    if (
      delegate !== undefined &&
      (typeof delegate !== "string" || !AGENT.test(delegate) || !holderKey)
    )
      fail("INVALID_INPUT");
    const cfg = await this.cfg();
    return this.store.transaction(async (r) => {
      const l0 = await this.agentLease(r, p, ref, "TASTE_EVALUATE", true);
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
      // One status entry per proof, so proofs of one lease cannot be linked by index.
      const commitment = epochCommitment(l),
        entry = await r.attest.allocate(l.leaseRef, STATUS.VALID);
      // The proof never outlives anything it relied on that is only noticed lazily.
      let validUntil = Math.min(
        toSeconds(l.state.expiresAt),
        toSeconds(l.state.checkpointDueAt),
        toSeconds(passport.expiresAt),
      );
      // An override the decision relied on ends lazily; the proof must not
      // outlive it.
      if (l.state.fingerprint.overrideIds.length) {
        const live = (await r.policy.overrides(l.passportRef)).filter((o) =>
          l.state.fingerprint.overrideIds.includes(o.overrideId),
        );
        for (const o of live)
          validUntil = Math.min(validUntil, toSeconds(o.expiresAt));
      }
      if (l.grantId) {
        const g = await r.platform.getGrant(l.grantId);
        if (!g) fail("LEASE_STATE_CONFLICT");
        validUntil = Math.min(validUntil, toSeconds(g.expiresAt));
      }
      const now = toSeconds(this.clock()),
        jti = newJti();
      const issued = await issueAttestation(
        {
          issuer: cfg.issuer,
          audience,
          now,
          leaseExpiresAt: validUntil,
          jti,
          epochRef: epochRef(cfg.epochKey, audience, commitment),
          statusUri: this.statusUri(cfg, entry.listId),
          statusIdx: entry.idx,
          holderKey,
          disclosable: {
            decision: "ALLOW",
            permitted: legacyWords(l.permittedActions),
            permitted_actions: l.permittedActions,
            ...(l.state.fingerprint.candidateCommitment
              ? {
                  candidate_commitment: l.state.fingerprint.candidateCommitment,
                  context_commitment: l.state.fingerprint.contextCommitment,
                }
              : {}),
            candidate_id: l.candidateId,
            candidate_name: l.candidateName,
            context_key: l.contextKey,
            agent_id: l.agentId,
            policy: { version: l.state.fingerprint.policyVersion },
            ...(delegate ? { delegate_agent_id: delegate } : {}),
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
        epoch: l.state.epoch.n,
        epochCommitment: commitment,
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
    const cfg = await this.cfg(),
      key = `${cfg.issuer}|${listId}`,
      now = Date.parse(this.clock());
    const version = await this.store.transaction((r) =>
      r.attest.listVersion(listId),
    );
    if (version === null) return null;
    // Reuse a signed list only while no bit has changed (the version moves on
    // every change) and for at most 30 s, so revocations are never hidden.
    const hit = statusMemo.get(key);
    if (hit && hit.version === version && now - hit.at < 30_000)
      return hit.token;
    const token = await this.signList(cfg, listId);
    if (token) statusMemo.set(key, { token, at: now, version });
    return token;
  }
  private async signList(
    cfg: AttestationConfig,
    listId: number,
  ): Promise<string | null> {
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
  // The owner's unified authority timeline: a derived, privacy-redacted read
  // over append-only records. It decides nothing and can be rebuilt any time.
  async authorityTimeline(p: Principal, raw: unknown) {
    const v = object(raw, ["passportRef", "limit"]),
      ref = typeof v.passportRef === "string" ? v.passportRef : "",
      limit = v.limit === undefined ? 200 : Number(v.limit);
    if (
      !/^tp_[a-f0-9]{48}$/.test(ref) ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 500
    )
      fail("INVALID_INPUT");
    return this.store.transaction(async (r) => {
      await this.locked(r, p, [], undefined, false);
      if (p.kind !== "SESSION") fail("ACCESS_DENIED");
      const passport = await r.platform.passport(ref);
      if (!passport || passport.userId !== p.userId) fail("PASSPORT_NOT_FOUND");
      const now = this.clock();
      const [
        states,
        policies,
        overrides,
        evals,
        leases,
        atts,
        grants,
        creds,
        revs,
        families,
      ] = await Promise.all([
        r.platform.versions(passport.profileId),
        r.policy.versions(ref, 50),
        r.policy.overrides(ref),
        r.policy.evaluations(ref, 80),
        r.leases.forPassport(ref, 30),
        r.attest.forPassport(ref),
        r.platform.grants(p.userId),
        r.platform.credentials(p.userId),
        r.platform.revocations(p.userId),
        r.oauth.families(p.userId),
      ]);
      const decisions = new Map(
        await Promise.all(
          evals.map(
            async (e) =>
              [
                e.evaluationRef,
                await r.policy.decision(e.evaluationRef),
              ] as const,
          ),
        ),
      );
      return buildAuthorityTimeline(
        {
          now,
          passportCreatedAt: passport.createdAt,
          states: states.map((s) => ({
            version: s.stateVersion,
            createdAt: s.createdAt,
          })),
          policies: policies.map((x) => ({
            version: x.version,
            createdAt: x.createdAt,
            note: x.note,
          })),
          overrides: overrides.map((o) => ({
            overrideId: o.overrideId,
            effect: o.effect,
            scope: o.scope,
            createdAt: o.createdAt,
            expiresAt: o.expiresAt,
            revokedAt: o.revokedAt,
          })),
          evaluations: evals.map((e) => {
            const pd = decisions.get(e.evaluationRef) ?? null;
            return {
              evaluationRef: e.evaluationRef,
              at: e.evaluation.evaluatedAt,
              agentId: e.evaluation.agentId,
              candidateName: e.evaluation.action.candidate.name,
              outcome: pd ? pd.outcome : e.evaluation.decision.outcome,
              baseOutcome: pd?.baseOutcome,
              basis: pd ? pd.basis : e.evaluation.decision.basis,
              rules: pd ? pd.rules : e.evaluation.decision.rules,
              policyVersion: pd?.policyVersion ?? null,
              requestedAction: e.requestedAction,
            };
          }),
          leases: await Promise.all(
            leases.map(async (l) => ({
              leaseRef: l.leaseRef,
              agentId: l.agentId,
              candidateName: l.candidateName,
              events: await r.leases.events(l.leaseRef),
            })),
          ),
          attestations: atts.map((a) => ({
            leaseRef: a.leaseRef,
            jti: a.jti,
            audience: a.audience,
            issuedAt: a.issuedAt,
            holderBound: a.holderBound,
            delegatedTo: a.delegatedTo,
            epoch: a.epoch,
          })),
          grants: grants
            .filter((g) => g.passportRef === ref)
            .map((g) => ({
              grantId: g.grantId,
              issuedAt: g.issuedAt,
              expiresAt: g.expiresAt,
              purpose: g.purpose,
              revokedAt: revs.grants[g.grantId],
            })),
          credentials: creds
            .filter((c) => !c.oauth)
            .map((c) => ({
              credentialId: c.credentialId,
              displayLabel: c.displayLabel,
              createdAt: c.createdAt,
              revokedAt: revs.credentials[c.credentialId],
            })),
          assistants: families.map((f) => ({
            familyId: f.familyId,
            clientName: f.clientName,
            connectedAt: f.createdAt,
            revokedAt: f.revokedAt ?? undefined,
          })),
        },
        limit,
      );
    });
  }
  // Public hosted verifier for relying parties that prefer an API.
  async attestationVerify(
    raw: unknown,
  ): Promise<VerifyResult & { dryRun: boolean }> {
    const v = object(raw, [
      "presentation",
      "audience",
      "nonce",
      "dryRun",
      "requireKeyBinding",
      "expect",
    ]);
    // The relying party's own candidate / situation (or their commitments).
    const expectation =
      v.expect === undefined
        ? undefined
        : presentedCommitments(
            object(v.expect, [
              "candidate",
              "context",
              "candidateCommitment",
              "contextCommitment",
            ]),
          );
    // An empty expectation would silently compare nothing: refuse it.
    if (
      expectation === null ||
      (expectation && !Object.keys(expectation).length)
    )
      fail("INVALID_INPUT");
    if (
      typeof v.presentation !== "string" ||
      v.presentation.length > 16384 ||
      typeof v.audience !== "string" ||
      !AUD.test(v.audience) ||
      (v.nonce !== undefined &&
        (typeof v.nonce !== "string" || v.nonce.length > 200)) ||
      (v.dryRun !== undefined && typeof v.dryRun !== "boolean") ||
      (v.requireKeyBinding !== undefined &&
        typeof v.requireKeyBinding !== "boolean")
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
      // Nothing the issuer clamps exp to is noticed by a status flip at that
      // instant, so the hosted verifier accepts no time past exp.
      clockSkewSeconds: 0,
      nonce: v.nonce as string | undefined,
      requireKeyBinding: v.requireKeyBinding === true,
      ...(expectation
        ? {
            expect: {
              candidateCommitment: expectation.candidate,
              contextCommitment: expectation.context,
            },
          }
        : {}),
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
