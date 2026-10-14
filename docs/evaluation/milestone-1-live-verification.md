# Milestone 1 live Qloo verification

> **Historical investigation record.** This document preserves the earlier REPAIR/partial-proof sequence and must not be read as the current project status. Final acceptance subsequently passed on M1 head `0063e11f98ee51b9106c67a88229eb7844512fde`; see [Milestone 1 live Qloo acceptance — 2026-10-13](milestone-1-live-acceptance-2026-10-13.md).

Status: **REPAIR — ACCEPTANCE NOT COMPLETE**. Credential authentication succeeded. The former credential blocker is resolved; unmocked application/verifier transport acceptance is now the blocker. No merge or M2 authorization is granted.

## Exact run binding

- Starting M1: 895683ee61d66e13d588bba2b75feafa713a410d.
- Date: 2026-10-13. Event host: https://hackathon.api.qloo.com; no production-host substitution.
- Official docs-public revision: d4a0eb978518f7fb404993d1509d11b21239ada6.
- Official hackathon-kit HEAD: 0db91b8d9c5aae2160d53596e57ea6c9da251cde.
- Harness: 0.1.26. Node: v24.19.0. npm: 11.9.0.
- The private credential file was retrieved from the authorized Drive folder, held outside git with mode 0600, and never printed or passed as a CLI argument. The credential email independently names the event host. It does not state a numeric quota or expiry; kit guidance requires bounded calls.
- Setup status: qloo ready true, source environment, mode live; model ready false, availableModels 0. CLI workflows need no model. Offline doctor reports credential/endpoint/native resolution/private state OK and model authentication warning. No network doctor or setup authentication probe was run.

## Reviewed canonical profile: Material & modern

| Signal       | Actual type | Qloo ID                              | Identity review                                                                        |
| ------------ | ----------- | ------------------------------------ | -------------------------------------------------------------------------------------- |
| Nils Frahm   | artist      | 0d8eafa4-ceea-44d5-8e1f-26a8a9f49a77 | Exact artist and composer description; collaboration matches not selected.             |
| Perfect Days | movie       | b30db61e-707c-421e-a1c4-1a912b7f067d | Exact 2023 release; 2011 fuzzy alternative rejected.                                   |
| Muji         | brand       | e12201a5-cc50-40af-97ae-c54a2ca303f7 | Exact Japanese retail brand and matching description.                                  |
| Piranesi     | book        | 55908017-4cfd-4688-9a7e-7b1ff04b171d | Disambiguation identifies 2020 / Susanna Clarke; unrelated Piranesi art book rejected. |
| Severance    | tv_show     | 569f8294-72da-4935-b9f2-4fc697ab2a1e | Exact TV title, 2022 disambiguation.                                                   |

Five distinct IDs across five cultural domains were checked together through /entities. Search take=3 and type filters were observed. No missing-search or malformed-query live test was added solely to spend quota; their live behaviors remain unverified.

## Observed wire contract and narrow repairs

- GET /search and GET /entities return results arrays with entity_id, name and types arrays, e.g. [urn:entity:artist]. Lookup normalization now reads that exact shape rather than scalar type/subtype guesses.
- GET /v2/insights returns success, results.entities and query; recommendation entities have type=urn:entity and subtype=urn:entity:<domain>. Insights normalization remains a separate explicit format.
- Verified requests use signal.interests.entities, filter.type, filter.exclude.entities for discovery, filter.results.entities for candidate evidence, feature.explainability=true and bounded take (8 discovery / 1 candidate).
- Score path is results.entities[i].query.affinity. No popularity, rank, index or alternative field is used.
- Contribution path is results.entities[i].query.explainability[signal.interests.entities], with entity_id and score. The former guessed entities contribution key was removed. Root warnings are reflected as safe completeness issues without exposing raw provider text.
- Sanitized observed fixtures and regression coverage preserve these shapes. No provider raw dump or credential is committed.

## Scores and context

All three target domains returned eight candidates: destination, place and brand. Across 24 discovery observations: minimum 0.8362903398323988, maximum 0.9233086745343598, median 0.8911215602938825. This is a top-eight sample for one profile, not a representative population or TasteBench.

**Wire scale: unit**, configured explicitly for the local live app. This is supported by multiple event-host observations, the official glossary's 0–1 definition and API examples using unit affinities. The percentage-oriented interpretation pages conflict with the wire representation; dividing these observed wire values by 100 would be incorrect. No automatic scale guessing was introduced. Other hosts/contracts must be independently verified.

**Comparability verdict: LIMITED.** Candidate-filtered and discovery values matched exactly for three fixed-profile examples. This does not establish global cross-query/domain comparability: official interpreting-affinity-scores.md states normalization is per query and advises relative interpretation. No universal authorization calibration is claimed.

**Threshold verdict: KEEP provisionally for experimental M1 diagnostics only.** >0.80 ALLOW, 0.50–0.80 inclusive ASK, <0.50 REJECT; policy remains tastepolicy-v1-experimental. No tuning or semantic version change occurred. Three high-ranked observations do not validate safe individual authorization, global thresholds or human alignment.

## Specific candidate observations

| Candidate / type                  | Qloo ID                              | Discovery and candidate-specific raw affinity | Unit-normalized affinity | Local deterministic replay | Explainability                                                  |
| --------------------------------- | ------------------------------------ | --------------------------------------------- | ------------------------ | -------------------------- | --------------------------------------------------------------- |
| HOUSE OF FINN JUHL HAKUBA / place | 85fda07d-0245-4445-a495-7d53df8950fb | 0.9233086745343598                            | 0.9233086745343598       | ALLOW                      | Complete: all five contribution IDs.                            |
| MasterClass / brand               | 64de0a20-be82-481a-a875-9aeaa941deb1 | 0.8886944207813341                            | 0.8886944207813341       | ALLOW                      | Complete: all five contribution IDs.                            |
| Edinburgh / destination           | a75e2277-6edf-4e18-831c-096e806e51ae | 0.8362903398323988                            | 0.8362903398323988       | ALLOW                      | Partial: Piranesi missing; explicit provider not_found warning. |

These are three genuine candidate-filtered Qloo responses, followed by offline production normalization/policy/receipt regression replay over captured sanitized evidence. They are **not** three successful unmocked application evaluations. Candidate IDs/types matched every request and differed from all input IDs. All observed evidence naturally maps to ALLOW under the unchanged experimental policy; no ASK/REJECT examples were manufactured.

Canonical target: **place**. It retains evidence from all five signals and gives a concrete hospitality proposal. Destination results explicitly warned that Piranesi was not found as an applicable signal, so destination does not prove all five influenced inference.

Place contribution summary: Perfect Days 0.24247254451055075; Muji 0.2316769078799444; Piranesi 0.19243708834488626; Nils Frahm 0.17690522839409517; Severance 0.15650823087052343. Values were preserved without renormalization or causal/probability claims.

## Repeatability, receipt and UI limits

The separate equivalent place repeat request timed out. Provider repeatability is therefore **NOT ESTABLISHED**, not local nondeterminism. Identical captured evidence reproduces the same local decision; seven observed-contract regressions test normalization, identities, completeness, real score preservation and receipt consistency. Test-created replay receipts use controlled test timestamps and are not advertised as genuine live UI receipts.

The actual unmocked local UI was run with the private server credential, explicit unit scale and fixed event host. All five resolution requests hit the existing eight-second transport timeout. No successful live UI decision or genuine UI Cultural Receipt was produced. The browser showed unavailable results, emitted no page errors, and did not send the credential or direct Qloo requests from browser code. Mocked E2E coverage remains separate from this failed live flow.

npm run verify:qloo was invoked against that real configured server. It returned PARTIAL_LIVE_PROOF, exit 2. The external diagnostic guard stopped further dispatches at the hard 25-attempt investigation ceiling; no reviewed acceptance attestation was fabricated. Guarded dispatch counting is conservative: timed-out calls may or may not have reached Qloo. There were twelve observed HTTP-200 raw responses, one raw repeat timeout, and subsequent server timeout/guarded attempts. No additional live calls or deliberate bad credentials were sent.

## Final result and next acceptance action

**M1 LIVE QLOO ACCEPTANCE — REPAIR.** Qloo works and the cultural evidence mechanism is viable, but the repaired application transport, successful real browser flow, genuine live receipt and complete verifier must still be verified within a separately authorized bounded investigation. Do not weaken checks, disguise timeouts or substitute recorded evidence for live app responses. Endpoint unknown-ID/error behavior also remains unverified live.

DEPLOYED_LIVE_PREVIEW_PENDING. No credential was installed into Vercel and no external deployment was changed.

PR #1 remains open/unmerged. PR #2 and M1.5 remain frozen at e6b415dda7233c3875adbb8ae3cf2bcfc8349046; no rebase occurred. Main remains 06b62bc8f12b35f31946381c122a7fde2e2f8a18. Milestone 2 did not start.

## Transport closure attempt — 2026-10-13

Starting SHA: d5f03565338d5b4b9c2a927d1ae5db0f29866d70. Status remains **REPAIR**. This separately authorized run stopped immediately on provider HTTP 429; no verifier or further live retry was attempted.

Prior private timing artifacts were unavailable. Five diagnostic dispatches established: serial Python/proxy search completed HTTP 200 in 8,331 ms; native Node search timed out after 12,003 ms; explicit Node proxy search completed HTTP 200 in 8,578 ms; two concurrent Node searches completed HTTP 200 in 9,296 and 9,274 ms. Public concepts only were used. The measured successful times exceed the previous 8,000 ms timeout. Five-way concurrency was not proven causal; two-way concurrency was demonstrated viable. Network/proxy setup is environment-specific and no proxy URL or credential was committed.

The minimum bounded repair uses a 15,000 ms provider deadline, two-request resolution waves preserving input ordering and individual failure results, and a 55,000 ms verifier operation deadline. Three waves plus the unchanged 3,000 ms body deadline fit within 48,000 ms; discovery/evaluation have two sequential provider calls plus body reading, bounded by 33,000 ms. Both fit below the verifier deadline and unchanged 60-second route execution limit. No retry, score, threshold, provider contract, host, byte ceiling or fixture fallback changed.

An actual production-build application was started locally with the private credential, unit scale and authorized environment proxy. The unmocked Playwright UI resolved all five canonical concepts, verified that each previously reviewed ID was among its actual matches, and explicitly selected those IDs. The first two application searches completed HTTP 200 in 10,707 and 10,636 ms; subsequent searches completed in 132, 166 and 126 ms. The canonical target was set to place. Discovery's first /entities dispatch returned HTTP 429 in 106 ms, so no discovery Insights, evaluation, receipt or repeat was attempted. This supports the timeout repair but does not establish why the initial connection is slower; no five-way counterfactual was run.

**Exact new dispatch count: 11** (5 diagnostics + 5 UI searches + 1 lookup). There were 9 HTTP 200 responses, 1 diagnostic timeout and 1 HTTP 429. No calls followed rate limiting. The 35 ceiling was not exhausted or used to justify retries.

Five-signal application resolution: PASS. Discovery/evaluation/genuine receipt/repeat: NOT COMPLETED due to rate limiting. verify:qloo: NOT RUN, because the mandatory precondition and stop-on-429 rule were not satisfied. Desktop initial/resolve/loading/identity-selection behavior was exercised; mobile, keyboard proposal, decision and receipt review remain pending. No direct browser-to-Qloo requests or client credential path was introduced; full successful browser review remains incomplete.

Two new regressions cover the concurrency maximum, ordering, one individually unavailable timeout, preservation of four other results, no retries, and composite budget ordering. Offline deterministic policy behavior remains unchanged. Final local suite: 136 unit/integration tests; 2 Playwright tests. See the completion report for final CI/audit status.

Remaining action: wait for the event quota/rate-limit window to permit a separately authorized bounded continuation. Do not conceal the 429, increase request volume, run the full verifier on a failed discovery precondition, or mark acceptance passed. DEPLOYED_LIVE_PREVIEW_PENDING; Vercel remains untouched.
