# Supply chain and dependency review

Run on 2026-10-25 against the lockfile at the reconciliation head.

| Check                            | Command                                                                 | Result                                                                                                                       |
| -------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Clean install                    | `npm ci`                                                                | run in CI on every push (see workflow)                                                                                       |
| Vulnerabilities (production)     | `npm audit --omit=dev`                                                  | 0 vulnerabilities                                                                                                            |
| Vulnerabilities (all)            | `npm audit`                                                             | 0 vulnerabilities                                                                                                            |
| Licenses (production)            | `npx license-checker-rseidelsohn --production --summary`                | MIT 119, Apache-2.0 14, ISC 6, MPL-2.0 3, MIT-0 2, LGPL-3.0-or-later 2, BSD 4, other permissive; 1 UNLICENSED (this project) |
| SBOM                             | `npx @cyclonedx/cyclonedx-npm --omit dev --ignore-npm-errors`           | CycloneDX JSON, 146 components: `docs/security/sbom.cdx.json`                                                                |
| Secret patterns in tracked files | `git grep -E` for key, token, private-key and credentialed-URL patterns | only synthetic values: the public sandbox credential (zeros), CI service-container password, test fixtures                   |

## Copyleft components (accepted)

- `@img/sharp-libvips-*` (LGPL-3.0-or-later): optional native binaries used by Next.js image optimization, dynamically loaded and unmodified.
- `lightningcss*` (MPL-2.0): build-time CSS tooling, file-level copyleft, unmodified.

Neither is modified or statically linked into TastePolicy code. Accepted residual risk: none beyond the usual transitive-dependency exposure; no major dependency upgrades were made close to the freeze.

## Not covered

No third-party penetration test. No reproducible-build attestation. The SBOM lists production dependencies only.
