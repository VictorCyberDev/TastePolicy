# TastePolicy Preference Authority API v1

All operations are cultural authorization only. No API key, share or ALLOW grants purchase, payment, booking, messaging, legal/account access or private-data execution authority.

## Setup and authentication

Apply migrations 0001 → 0002 → 0003 → 0004 → 0005 on a dedicated PostgreSQL database. `npm run db:migrate:platform` applies only 0005. Configure server-only DATABASE_URL, BETTER_AUTH_SECRET and BETTER_AUTH_URL. Never use NEXT_PUBLIC variables for secrets. The account UI is `/account`; Judge Mode remains separate. No demo claim/import is implemented.

Sign in, initialize a private Passport using five independently reviewed identities, then issue an expiring, scoped developer credential. Copy its plaintext secret once. The API header is `Authorization: Bearer <your-issued-secret>`; only its hash persists. Credential ID/label/scopes/expiry/revocation remain inspectable, never the secret. Rotation revokes the old credential atomically. Retry of issuance returns durable metadata, not another secret.

API credentials identify an account. They cannot create grants, issue keys, export or delete; those require a fresh browser session with exact-origin protection. To access another account's Passport, the credential owner also needs an active grant from that Passport owner. No raw ownerProfileId, profileId or caller userId is accepted as authority.

## Routes

| Method / route                                 | Required key scope | Shared grant scope    | Contract                                                                         |
| ---------------------------------------------- | ------------------ | --------------------- | -------------------------------------------------------------------------------- |
| GET or POST `/api/v1/passport`                 | PASSPORT_READ      | READ_PASSPORT_SUMMARY | passportRef, optional grantId → taste-passport-v1 summary                        |
| POST `/api/v1/passport` with stateSummary=true | PASSPORT_READ      | READ_STATE_SUMMARY    | counts only; no raw anchors/constraints                                          |
| POST `/api/v1/evaluate`                        | TASTE_EVALUATE     | EVALUATE_TASTE_ACTION | current state + action → structured response                                     |
| GET or POST `/api/v1/policy`                   | PASSPORT_READ      | READ_PASSPORT_SUMMARY | passportRef, optional grantId/agentId → resolved autonomy, limit, freshness (M7) |
| GET or POST `/api/v1/receipt`                  | RECEIPT_READ       | READ_RECEIPT          | evaluationRef → sanitized captured preference evidence                           |
| GET or POST `/api/v1/status`                   | RECEIPT_READ       | READ_RECEIPT          | evaluationRef → completed decision/status                                        |

GET parameters are query parameters; POST bodies are JSON. There is no raw Qloo endpoint or arbitrary-profile endpoint. Own access needs no grantId. Shared receipt/status requires the original grantee and relevant active grant; summary access does not imply receipt access.

Evaluation input (placeholders below are intentionally **not resolved provider identities**):

```json
{
  "idempotencyKey": "your-stable-operation-key",
  "passportRef": "<your-issued-private-passport-reference>",
  "grantId": "<only-for-shared-access>",
  "proposal": {
    "agentId": "Your-Agent",
    "expectedStateVersion": 1,
    "candidate": {
      "id": "<independently-reviewed-candidate-UUID>",
      "name": "<candidate-display-name>",
      "type": "place"
    },
    "context": { "key": "dinner", "domain": "place" }
  }
}
```

Read the actual current stateVersion; the illustrative 1 is not permission to reuse stale evidence. Candidate domain is brand/place/destination. Optional context.price is `{amount,currency}` under the existing state contract. Candidate identity/type and the five subject signals are revalidated by the existing engine. A candidate cannot be an input anchor. No browser snapshot creates provider evidence.

The response has schemaVersion `taste-authorization-response-v1`, evaluationRef, passportRef, stateVersion/hash, decision, decisionBasis, unresolvedFactors, receiptRef, status COMPLETED, continuation and createdAt. COMPLETED means the evaluation operation finished, including an explicit UNAVAILABLE outcome; it does not mean cultural evidence was available. Receipt retrieval returns recorded captured evidence and makes no Qloo request.

| Outcome     | Continuation permitted                     | Automatic retry |
| ----------- | ------------------------------------------ | --------------- |
| ALLOW       | recommend, add_to_draft (see ladder below) | false           |
| ASK         | request_clarification                      | false           |
| REJECT      | do_not_proceed, offer_repair               | false           |
| UNAVAILABLE | do_not_assume_negative_preference          | false           |

`continuation.permittedActions` expresses the same permission on the subjective-action ladder: SUGGEST, RANK, SHORTLIST, ADD_TO_DRAFT, PRESENT_AS_SELECTED. The legacy words map as `recommend` = SHORTLIST and `add_to_draft` = ADD_TO_DRAFT, so a legacy ALLOW (no ladder configured, no `requestedAction`) permits SUGGEST, RANK, SHORTLIST and ADD_TO_DRAFT and never PRESENT_AS_SELECTED. Send `requestedAction` to say how far you intend to go; if that is beyond the ceiling the owner set for this agent and kind of choice, an ALLOW becomes an ASK of kind AUTHORITY_CONFIRMATION (the owner can allow that one exact choice). Hard blocks, saved limits, UNAVAILABLE and group vetoes are never changed by the ladder. `commitments` (`taste-commitments-v1`) are canonical digests of the candidate and context that were evaluated; present the current ones on lease verify/checkpoint to have a change noticed.

These labels do not invoke clarification/repair automatically. The response always retains a cultural-only authority boundary. No confidence percentage is computed.

## Errors, idempotency and bounds

Errors are `{status:"error",code,requestId}` with no raw DB/provider errors or stacks. AUTH_REQUIRED, ACCESS_DENIED, GRANT_REQUIRED, GRANT_EXPIRED, GRANT_REVOKED, PASSPORT_NOT_FOUND, STATE_VERSION_CONFLICT, CREDENTIAL_REVOKED, CREDENTIAL_EXPIRED, RECENT_AUTH_REQUIRED, RATE_LIMITED and IDEMPOTENCY_KEY_CONFLICT are explicit. Revoked/expired access fails before provider construction. Physical deletion makes captured records unavailable, never a new REJECT.

Use a stable idempotencyKey for one canonical evaluation payload. Completed retries avoid provider work; changed payload conflicts. Current access is still required after revocation. Crash before durable commit can repeat provider work on explicit retry. There is no exactly-once external-delivery promise.

API rate: 30 requests per account per UTC minute. Evaluation quota: 100 per subject per UTC day. Body: 16 KiB, three-second read deadline. Existing provider request/deadline limits and process admission apply. Ordinary evaluation has at most entities + candidate Insights. SDK network deadline is 45 seconds, redirects are rejected and no automatic retry occurs.

## TypeScript SDK

`src/sdk/index.ts` exports TastePolicyClient and request/response types. It is a server-only-use thin client; no thresholds, Qloo calls, browser key storage or automatic retry. It is not published to npm. See `examples/platform-client.mjs`. Supply credentials privately through the process environment; never command-line secret arguments or client bundles.

```ts
const client = new TastePolicyClient(serverOrigin, privateApiKey);
const passport = await client.passport({ passportRef });
const result = await client.evaluate({
  passportRef,
  idempotencyKey,
  proposal: {
    agentId,
    expectedStateVersion: passport.stateVersion,
    candidate,
    context,
  },
});
// result.decision, result.receiptRef, result.continuation
```

The example can run with Node 24: `node --experimental-transform-types examples/platform-client.mjs`. It prints only schema/state-version metadata, never the credential/export.

## Local MCP

Use `node --experimental-transform-types scripts/platform-mcp.mjs` with trusted process environment TASTEPOLICY_API_URL and TASTEPOLICY_API_KEY. Do not put secrets in public MCP JSON. Invoke Node directly (or `npm run --silent mcp:platform`), so npm banners cannot corrupt MCP stdout.

MCP 2025-06-18 stdio supports initialize, ping, tools/list and tools/call. Six tools reuse the same versioned API:

- get_taste_passport
- evaluate_taste_action
- evaluate_shared_taste_action
- get_authorization_receipt
- explain_taste_decision (captured structured decision evidence, no LLM narrative)
- inspect_evaluation_status

Tool calls execute under the explicit developer credential and grant scopes. There is no remote MCP listener, raw Qloo tool, arbitrary host/profile argument, list-accessible-Passports tool or extra stability capability. Input buffer/messages are bounded to 16 KiB and processed serially; HTTP requests retain server validation/rates/timeouts. Discovery metadata is not private authority. Errors are sanitized; stdout contains only JSON-RPC messages.

Official contracts consulted: [Better Auth installation](https://better-auth.com/docs/installation), [session management](https://better-auth.com/docs/concepts/session-management), [MCP stdio](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports) and [tools](https://modelcontextprotocol.io/specification/2025-06-18/server/tools).

## V3 public subject contract

`/evaluate` is the Preference Authority primitive. Conceptually evaluate(subject, action, context); the current stable request uses passportRef plus proposal.candidate/context and expectedStateVersion. No route redesign or direct subjectRef input is introduced. The output returns subjectRef, decision, decisionBasis, unresolvedFactors, receiptRef, continuation and stateVersion. A reference is not access authority.

TastePolicy Passport is a user-controlled preference authority reference, distinct from agent identity/passport systems. PassportSummary exposes subjectRef (`tps_` plus 48 random hex characters), never an internal profile ID. supportedCapabilities = PREFERENCE_AUTHORIZATION/CAPTURED_REPLAY; supportedActions = SELECT_ENTITY; supportedCandidateDomains = brand/place/destination. Do not infer arbitrary action support.

ReceiptResponse adds source=recorded, receiptSchemaVersion=taste-platform-receipt-v1 and authorizationEvidence: an explicit captured-evidence projection with action, context, decision, cultural evidence, state version/hash and provenance, without internal profileId. It does not return baseEvaluation. The stored StateEvaluation and Cultural Receipt v1 stay unchanged. This is an access/privacy wrapper, not a signature or M9 verifiable receipt. Export uses originSubjectRef; internal ownership mappings stay server-side.

MCP returns the same public contracts, including passportRef and subjectRef; no state-profile identity is semantic subject authority. Continuation and automaticRetry=false are unchanged.

A2A is remaining M6G work after the guide-owned WIN GATE under the then-current official A2A specification. WIN GATE is not completed, A2A runtime is not implemented and this PR is not merge-ready. See [Canonical Architecture v3](../architecture/canonical-architecture-v3.md).
