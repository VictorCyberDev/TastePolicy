# Milestone 1 live Qloo acceptance — 2026-10-13

Status: **LIVE_ACCEPTANCE_PASSED — final independent PR review still required.** This evidence does not merge PR #1 and does not authorize Milestone 2.

## Binding and rate limit

- Pre-repair M1 head: `3ebb85ccc526732cb34d9d6ff12857175283650d`.
- Event host: `https://hackathon.api.qloo.com`.
- Live headers exposed a per-second limit of **5 requests**, a monthly limit of **10,000**, 9,971 monthly requests remaining at the bounded probe, and a one-second reset window.
- The prior 429 was burst-rate exhaustion, not monthly quota exhaustion: five-signal `resolve` completed in about 853 ms and immediate discovery then returned HTTP 429.
- Repair: the live verifier waits **1,100 ms between app operations only**. There are still no retries. Provider readers, Qloo wire semantics, score normalization, policy thresholds, application runtime behavior and receipt semantics are unchanged.

## Real provider/application proof

- Five canonical reviewed identities were resolved and selectable: Nils Frahm / artist, Perfect Days (2023) / movie, Muji / brand, Piranesi / book, Severance / tv_show.
- Real `place` discovery returned eight candidates. `HOUSE OF FINN JUHL HAKUBA` remained rank 1 with raw/unit affinity `0.9233086745343598`.
- Candidate-specific evaluation returned `ALLOW`, reason `STRONG_ALIGNMENT`, complete explainability with five contributions, policy `tastepolicy-v1-experimental`, receipt schema `cultural-receipt-v1`, normalization `affinity-explicit-scale-v1`, and `/v2/insights` provenance.
- A separately paced repeat returned the same candidate, score, scale, decision, reason, explainability completeness and policy/schema semantics.

## Unmocked browser proof

The real production build was exercised in Chromium against the private live-configured local server. It resolved all five reviewed IDs, discovered `place`, evaluated the real candidate, displayed `ALLOW` and the real Cultural Receipt, then remained usable at 390×844 with no horizontal overflow. Decision and receipt remained visible; the machine-readable receipt disclosure was keyboard focusable/toggleable; page/console errors were zero.

## Committed verifier gate

With a reviewed live-evidence record, the acceptance logic returned **`LIVE_ACCEPTANCE_PASSED`** at `2026-10-13T15:41:38.396Z`:

- destination: available, 8 candidates;
- place: available, 8 candidates;
- brand: available, 8 candidates;
- HOUSE OF FINN JUHL HAKUBA / place: `ALLOW`, `0.9233086745343598`, complete explainability;
- MasterClass / brand: `ALLOW`, `0.8886944207813341`, complete explainability;
- Edinburgh / destination: `ALLOW`, `0.8362903398323988`, partial explainability;
- repeat checks: same score, decision, scale, policy and explainability.

Threshold verdict remains **KEEP, provisional**. All observed live scores were above 0.80; this run does not empirically calibrate ASK/REJECT boundaries and does not establish universal cross-query score comparability.

Final merge remains gated on the exact pushed SHA passing repository validation/CI and independent review. Milestone 2 remains unauthorized until the M1 merge sequence and explicit implementation approval.
