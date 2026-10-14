# M1.6 local proof and semantic boundary

Design record written before implementation, against main 70e72f7457b76df8d5112263fb68a0afba162f4a. Canonical architecture v2 read completely. M1.6 scope explicitly narrows the conceptual leave-one-signal-out direction: five signals remain mandatory, so no provider perturbation is attempted.

## Authoritative services

The existing evaluateAction application service, injected QlooProvider, fixed-host transport/adapter, normalization, evaluateEvidence/POLICY_V1 and createReceipt remain authoritative. Demo origin/body deadlines, process-local budget, provider five-call ceiling, 15-second timeout and verifier-only pacing remain unchanged. A framework-neutral semantic gateway wraps evaluateAction rather than duplicating the provider or policy. Caller target type is checked against the entity lookup in the same operation, without an extra Qloo dispatch. Caller identity review is an explicit attestation, not authentication; entities are still verified server/process-side.

## Proof modules

Signature Receipt and Capability Comparison are presentation over the same captured receipt. Shared pure receipt-proof functions validate known schema/policy/normalization, re-snapshot through the existing receipt builder, explain existing structured fields and replay the existing policy three times. These pure leaf functions contain no credential, provider transport or network dependency and may be used by the browser for diagnostic presentation. They never issue a new authorization or replace the server's returned outcome. Unsupported/corrupt/historical policy versions fail explicitly rather than silently reinterpreting them.

Boundary sensitivity uses exact unrounded normalized score and current captured thresholds. >0.80 ALLOW, 0.50–0.80 inclusive ASK, <0.50 REJECT are unchanged. Output states whether touching a boundary changes the outcome; crossing an exclusive boundary is strictly required. This is deterministic replay and policy-boundary sensitivity, not provider robustness, statistical certainty or individual preference confidence.

Comparison refers to one proposal/receipt across all panels. Agent proposal alone has no fabricated evidence; Qloo evidence contains no TastePolicy decision; TastePolicy adds actual experimental policy and receipt. No LLM, separate recommendation, benchmark or accuracy claim.

## Local interoperability

A one-request JSON stdin/stdout CLI exposes only evaluateTasteAction, explainTasteDecision and checkDecisionStability. Evaluation uses a fresh bounded provider via dependency injection and the existing process-local budget. No public HTTP endpoint is added; no arbitrary provider method, URL, header, execution operation or transaction authority is exposed. Input is byte/time bounded and errors are fixed safe codes. Pure receipt operations do not construct a provider. Caller-supplied captured receipts are not authenticated or signed and must be labeled recorded or synthetic; only a newly successful process-side evaluation is labeled live.

Use Node 24 native TypeScript transformation (--experimental-transform-types is needed for the existing body-reader parameter property) and a local fixed source-import resolver (no new dependency). The server-only package's react-server condition is applied only to this trusted local process. A test-only subprocess harness injects synthetic providers; production CLI has no fixture flag or fallback. MCP is deferred: a stdio CLI proves the required second-process contract without a protocol SDK, duplicate service or public quota surface. No persistence, continuation schema, M2, LLM or new authorization semantics.
