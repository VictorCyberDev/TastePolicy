# Dependency security review

Phase 0 npm audit identified a high-severity development-only dependency chain: eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces (GHSA-vfj7-8cjw-p6xm). Registry latest braces remains 3.0.3, within the advisory range. The suggested force fix downgrades the Next ESLint config to 14.x, which is inappropriate for Next 16. No breaking-force upgrade was applied. Avoid passing untrusted glob patterns to local lint tooling; recheck upstream before production feature development. This finding does not imply a runtime endpoint vulnerability.

ESLint 9.39.5 is retained for compatibility with Next’s transitive lint plugins (which declare ESLint 9 peer ranges). npm marks this line deprecated; update once the complete Next lint chain supports ESLint 10. ESLint 10 was tested but reverted to avoid peer conflicts. Browser tooling is pinned to 1.56.1 after the latest browser artifact failed to download; the pinned Chromium downloaded successfully from its fallback mirror. Runtime-only audit reports zero vulnerabilities.

Milestone 1 recheck (2026-10-10): npm ci succeeded; full npm audit still reports the same five high development-chain findings and zero critical findings. Runtime-only npm audit reports zero vulnerabilities. No new dependency was added, and no force downgrade was applied.

M2 adds pinned pg for server-side PostgreSQL and development-only @types/pg and @electric-sql/pglite for real PostgreSQL-compatible SQL tests. No Supabase SDK or browser persistence dependency. Runtime audit recheck reports zero findings; development-chain findings remain separately tracked. No force upgrade.

## WG-B consumer authorization recheck — 2026-10-23

The previously pinned Next.js 16.4.0 is now reported vulnerable by the npm production audit (GHSA-2464-fhr4-w9xw, GHSA-p3m5-59mp-jv5r and GHSA-673q-mjm6-r5xr). The build stopped with a security warning during consumer-flow validation. This is a newly surfaced dependency finding, not a TastePolicy policy failure. Maintainer advisories identify patched 16.4.x releases: [image optimization](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw), [App Router](https://github.com/vercel/next.js/security/advisories/GHSA-p3m5-59mp-jv5r), and [cache serialization](https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr).

Next.js and its matching ESLint configuration are pinned to 16.4.2 in a separate security patch. No new production dependency or product capability is introduced. Production audit after the update reports zero vulnerabilities. Historical audit observations above remain historical. Policy, Qloo semantics, state/receipt contracts, the accepted photography implementation and main are not modified by this dependency patch. GUIDE retains review and merge authority.
