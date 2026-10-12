# Live verification operational handoff

**NOT EXECUTED IN M1.5.** Provider readers, verifier, thresholds and score semantics remain unchanged. Read scripts/verify-qloo.mjs and docs/evaluation/milestone-1-live-verification.md before the separately authorized live task.

## Pre-credential preparation

- Keep frozen M1 at 895683ee61d66e13d588bba2b75feafa713a410d and PR #1 open/unmerged.
- M1.5 is a stacked presentation branch. Reconcile it if verified M1 provider repairs change normalized contracts.
- Store an event credential only through a trusted private environment/config mechanism; never paste into chat or CLI arguments.
- Use the assigned credential host. TastePolicy uses QLOO_API_BASE_URL. The separately installed harness uses QLOO_BASE_URL/private base-url configuration; do not assume one configures the other.
- Leave QLOO_AFFINITY_SCALE unset until current official documentation plus multiple live observations establish its meaning.
- Harness setup may itself make an authentication probe; do not run it until live verification is authorized.

## When live verification is separately authorized

1. Verify exact repo/PR state again and consult current official Qloo documentation.
2. Configure the key privately and the assigned host; use a minimal bounded authentication/resolution probe.
3. Establish actual search, entity and Insights wire contracts privately, without public raw dumps.
4. Verify raw affinity scale and extraction; configure only the verified unit/percent mode.
5. Start the real local application with npm run dev. Run npm run verify:qloo in a second terminal.
6. The existing runner probes three target domains, evaluates three distinct candidates and repeats one; it does not permit production fixtures. It is not a distribution study or a full manual acceptance protocol by itself.
7. Record real evidence using ../evaluation/live-evidence-report-template.md. Review distribution/comparability, identities, wire semantics and unmocked UI independently.
8. Supply a truthful sanitized QLOO_VERIFY_REVIEW_FILE only after that review. Existing verifier exact-repeat checks are deliberately stricter than potential provider variability; investigate any difference in the later live task rather than changing them during presentation work.
9. Require LIVE_ACCEPTANCE_PASSED and complete the independent acceptance protocol. Missing credentials/auth/contract/partial results never count as success.
10. Perform final independent PR #1 review at the exact live-tested SHA. Merge and M2 implementation require their own authorization.

Harness raw search command syntax (NOT executed live):

```sh
qloo api search --query "Agatha Christie" --json
qloo api search --query "Agatha Christie" --type book --take 3 --json
```

The prior harness 0.1.26 preflight found search --dry-run still requires credential presence. Do not supply fake credentials to bypass that check. No model sign-in is needed for the CLI workflows. All harness surfaces share quota; none is added to TastePolicy in M1.5.
