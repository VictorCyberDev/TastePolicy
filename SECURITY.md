# Security

## Reporting

Use GitHub private vulnerability reporting if enabled. Otherwise open a minimal issue requesting a private reporting channel, without exploit details, credentials or personal data. Do not publish sensitive material in a public issue. No response-time SLA is offered during the hackathon.

## Secret policy

Never commit credentials, .env files, tokens, private keys or provider payloads. `.env.example` contains blank placeholders only. Server configuration imports server-only; never serialize it into client props or responses. NEXT_PUBLIC values are public. Service-role credentials must never have that prefix. If a secret is exposed, revoke/rotate it immediately and coordinate history cleanup.

## Supported expectations

Only the latest main branch is maintained. Phase 0 has no authentication, persistence, provider integration, or action execution. Do not use it for sensitive production workloads until those boundaries receive threat review. Dependency findings should be reviewed, not fixed with blind force upgrades.

## Baseline

Security headers include nosniff, frame denial, limited CSP, referrer and permissions policies, and production HSTS. CSP is deliberately partial and does not claim comprehensive script protection; a nonce policy belongs in a future integration review. Public errors are generic. Request IDs are generated internally, not trusted from input. Logging allows only fixed event names and generated identifiers; never pass arbitrary secrets, headers, bodies or stack traces. No eval, debug backdoors or arbitrary execution is introduced.
