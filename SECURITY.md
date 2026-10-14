# Security

## Reporting

Use GitHub private vulnerability reporting if enabled. Otherwise open a minimal issue requesting a private reporting channel, without exploit details, credentials or personal data. Do not publish sensitive material in a public issue. No response-time SLA is offered during the hackathon.

## Secret policy

Never commit credentials, .env files, tokens, private keys or provider payloads. `.env.example` contains blank placeholders only. Server configuration imports server-only; never serialize it into client props or responses. NEXT_PUBLIC values are public. Service-role credentials must never have that prefix. If a secret is exposed, revoke/rotate it immediately and coordinate history cleanup.

## Supported expectations

Only the latest main branch is maintained. Milestone 1 has server-side Qloo integration, but no authentication, persistence or action execution. Do not use it for sensitive production workloads until those boundaries receive threat review. Dependency findings should be reviewed, not fixed with blind force upgrades.

## Baseline

Security headers include nosniff, frame denial, limited CSP, referrer and permissions policies, and production HSTS. CSP is deliberately partial and does not claim comprehensive script protection; a nonce policy belongs in a future integration review. Public errors are generic. Request IDs are generated internally, not trusted from input. Logging allows only fixed event names and generated identifiers; never pass arbitrary secrets, headers, bodies or stack traces. No eval, debug backdoors or arbitrary execution is introduced.

Qloo HTTP is confined to fixed approved origins and paths; redirects are rejected. Credentials are never logged or returned. Query lengths, UUIDs, five-signal profiles, strict route schemas and bounded response/body sizes are validated. Upstream errors are typed and sanitized; arbitrary metadata is dropped. React renders text rather than raw provider HTML. Evidence scores supplied by callers are rejected. Missing evidence is not a REJECT. Process-local quotas are best-effort, not production distributed abuse protection. A live deployment with a funded key needs quota monitoring before unrestricted traffic. No Qloo raw dumps should be committed.

Pre-key hardening adds a three-second total body-read deadline and five-call ceiling per request-created Qloo transport, without retries. Invalid or slow bodies cannot hold local concurrency slots indefinitely. These limits do not bound account-wide traffic across Vercel instances. Enable platform deployment protection and monitor provider quotas before public credentialed use; origin checks are not authentication or account-wide abuse prevention. Receipt construction checks identity/decision/provenance and snapshots allowlisted fields. No provider request ID or signing guarantee is fabricated.
