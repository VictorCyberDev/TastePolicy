# M1.5 UX review

Baseline: 895683ee61d66e13d588bba2b75feafa713a410d. Reviewed before visual edits against a locally running production build with Qloo configuration blank. Decision states were inspected through explicitly synthetic browser interception, never a production fallback or live proof.

## Observed weaknesses

- Initial thesis lacks the distinction between identity, technical permission and cultural policy.
- Status lives at the bottom of a long page; loading and failure are distant from the initiating control.
- Missing configuration repeats across five fields without a prominent intentional UNAVAILABLE presentation.
- Candidate discovery is framed like a recommendation list; the proposal has no distinct visual identity.
- ALLOW/ASK/REJECT share the same border treatment and sparse supporting copy.
- Receipt hides raw score, scale, identity/provenance and schema versions in JSON; contribution explanations are terse.
- Mobile requires traversing every input before reaching policy output; forms need clearer visible labels and touch/focus treatment.
- Validation/unexpected failures share generic presentation. There is no skip link or explicit input error association.

Baseline desktop/light, phone/dark, resolution/discovery, loading, proposal, three synthetic decision outcomes and receipt were viewed. No page errors were observed. Synthetic screenshot data used visibly synthetic labels and was kept outside git. No canonical IDs were resolved.

## Review limits

Keyboard, validation and full post-change browser acceptance are recorded after the readiness pass. This document is a presentation review, not provider-contract validation or threshold calibration.

## Post-change acceptance

The readiness pass passed npm ci, npm run verify (format:check, lint, typecheck, 142 unit/integration tests and production build), and npm run test:e2e (10 Chromium tests). Fifteen new unit presentation regressions and eight additional browser cases supplement preserved M1 coverage. A stale ignored Turbopack cache initially served baseline assets; it was removed and the final build/browser run used freshly generated output.

Reviewed desktop/light and narrow 390×844 phone/dark views, synthetic ALLOW/ASK/REJECT, candidate framing, expanded human/JSON receipt, real unconfigured runtime and synthetic unavailable/error states. Keyboard tests cover the skip link, associated empty-input validation/focus and Enter activation of receipt disclosure. Loading labels follow actual resolve/discover/evaluate requests; no progress percentage or separate simulated receipt stage exists. Mobile output moves ahead of input panels after a proposal; long candidate text and JSON do not overflow the viewport.

Automated lightweight accessibility checks verify visible form labels, nonempty headings, 44px control heights, focus outlines and AA contrast for foreground/muted/accent text tokens against both main surfaces in light/dark themes. This is not a complete accessibility certification or a human screen-reader audit. Decisions use text, symbols and distinct border treatments, and the receipt is usable without a visualization. Reduced-motion overrides are present; no decorative animation was added.

Browser checks found no page errors or unexpected console errors; expected resource error messages from deliberate HTTP failure tests are allowed explicitly. Synthetic screenshots carry a conspicuous test-only banner and remain ignored artifacts, not live proof. Real health returned the expected non-sensitive body and security headers. Source/client-bundle scans found no credential references in client output or secret patterns; runtime npm audit has zero findings. The five previously documented high development-tool findings remain.

Frozen provider/policy/service/domain/environment/verifier modules and dependencies are unchanged. Real identity, affinity, contribution and public live-flow acceptance remain blocked on the Qloo credential. No M2 implementation, final video or Devpost submission occurred.
