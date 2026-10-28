# Contributing

Contributions use the repository's Apache-2.0 license. Keep the preference-authority boundary explicit: Qloo affinity is not permission, UNAVAILABLE is not REJECT, and proof verification does not grant execution authority.

Use Node 24 and `npm ci`. Keep changes scoped, accessible and strictly typed. Keep external providers behind explicit adapters and record significant architectural choices as ADRs. Run `npm run verify` and the relevant Playwright engines before release. Add meaningful tests for behavior and error boundaries, not test-count padding. Keep temporary generated output out of git; documented distributable resources and release artifacts are exceptions.

Use a focused branch and pull request. Read `AGENTS.md` and the installed framework documentation, preserve migration history, and run the relevant checks from `package.json`. Explain the behavioral change and its evidence. Do not weaken tests to accommodate failures.

Include a Developer Certificate of Origin sign-off (`git commit -s`) for new outside contributions. By signing off, certify the origin and right to submit your contribution under [DCO 1.1](https://developercertificate.org/). Do not add a sign-off on another person's behalf. No CLA or ownership transfer is implied.

Keep original notices and identify external code/media sources. Do not commit credentials, provider raw payloads, personal preference data, private human-pilot responses or unsupported commercial/security claims. Report vulnerabilities privately through the security contact described in `SECURITY.md`.
