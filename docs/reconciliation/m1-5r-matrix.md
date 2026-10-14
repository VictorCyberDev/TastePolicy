# M1.5R reconciliation matrix

Historical reconciliation checkpoint — 2026-10-14, preserved for reviewed implementation 3d965cb32752ef37c1ab9aaba785911fb7d98bcf. Written before implementation; workflow statements below describe that checkpoint, not current PR status. Baseline main: 84636d6e502e0686db6dc9a483f6908cd466ccf9. Historical source: e6b415dda7233c3875adbb8ae3cf2bcfc8349046; original base: 895683ee61d66e13d588bba2b75feafa713a410d. All 18 historical changed files inspected against original base and current main. Canonical architecture v2 read completely; it controls milestone order. At this checkpoint, historical PR #2 was unchanged and Draft.

| Historical file                                  | Classification | Reconciliation                                                                                                                   |
| ------------------------------------------------ | -------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| README.md                                        | ADAPT          | Retain verified main truth; add M1.5R presentation links. Drop pre-live/stacked status.                                          |
| docs/evaluation/live-evidence-report-template.md | SUPERSEDED     | Final accepted M1 report/verifier are authoritative. Do not restore speculative wire investigation.                              |
| docs/submission/demo-script.md                   | ADAPT          | Verified canonical profile/place; recording requires current real responses, not predetermined outcomes.                         |
| docs/submission/demo-seeds.md                    | ADAPT          | Canonical Material profile verified historically; alternatives explicitly unverified.                                            |
| docs/submission/live-operations.md               | SUPERSEDED     | Replace pre-credential protocol with bounded presentation-smoke guidance referencing accepted M1.                                |
| docs/submission/m1-5-ux-review.md                | DROP           | Old checkpoint/test counts/credential blockers are stale; create a new M1.5R review.                                             |
| docs/submission/readiness.md                     | ADAPT          | Verified M1; v2 milestone order; later systems remain future.                                                                    |
| docs/submission/video-storyboard.md              | ADAPT          | Live recording readiness; synthetic screenshot labeling; no assumed outcome.                                                     |
| src/app/globals.css                              | KEEP           | Responsive tokens/focus/44px controls/reduced motion; assess rendered quality.                                                   |
| src/features/demo/DecisionView.tsx               | ADAPT          | Explicit experimental cultural decision, affinity-relative warning, no execution permission or implemented clarification.        |
| src/features/demo/Demo.tsx                       | ADAPT          | Keep real accepted profile/API calls; place-guided Judge Mode; remove stale Dune/live-pending copy; explicit identity selection. |
| src/features/demo/ReceiptView.tsx                | ADAPT          | Existing schema only; evidence/provenance/experimental policy/JSON progressive disclosure.                                       |
| src/features/demo/presentation.ts                | KEEP           | Safe differentiated notices using current unchanged unavailable reasons.                                                         |
| tests/e2e/demo-flow.spec.ts                      | ADAPT          | Keep current M1 coverage; label synthetic interception and adapt new rendering.                                                  |
| tests/e2e/presentation.spec.ts                   | ADAPT          | Port presentation tests; add Judge Mode/live-label isolation/current preset coverage.                                            |
| tests/e2e/smoke.spec.ts                          | ADAPT          | Preserve real unconfigured runtime checks with new deliberate unavailable copy.                                                  |
| tests/presentation.test.tsx                      | ADAPT          | Current receipt/domain fixtures and judge path; presentation only.                                                               |
| tests/receipt-presentation-fixture.ts            | KEEP           | Test-only synthetic receipt built by unchanged policy/receipt functions.                                                         |

Summary: KEEP 3; ADAPT 12; DROP 1; SUPERSEDED 2; CONFLICTS_WITH_VERIFIED_M1 0 runtime files. Stale documentation conflicts with verified truth and is adapted/superseded, never copied unchanged. The implementation preserved main provider/policy/environment/domain/verifier modules and acceptance artifacts byte-for-byte. No merge, rebase or wholesale cherry-pick was used.

Known source conflicts: old Demo uses destination default, Dune hints and live-proof-pending copy; old documents claim no credential/no acceptance and M2 next. The baseline main had reviewed Material signals, accepted unit-scale readers, 15-second budgets and verifier pacing. Preserve those exactly. Historical tests/fixtures are synthetic, not live evidence.
