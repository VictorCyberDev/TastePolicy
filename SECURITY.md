# Security reporting

Report a suspected vulnerability privately to **victornnajiofor1@gmail.com**, subject `TastePolicy security report`. Include the affected URL/revision, reproduction steps and impact. Omit live credentials and private preference data. This is the founder's support/security address, not a staffed security operations center.

Use your own account and synthetic or public test anchors. Do not access another user's data, run denial-of-service tests, send unsolicited messages, execute financial/legal actions, or retain data obtained accidentally. There is no funded bug bounty or guaranteed response SLA. The founder aims to acknowledge reports within three business days when available; this is an operating target, not a contractual promise.

Supported hosted release: canonical `https://tastepolicy.vercel.app`. Branch previews are development environments. No SOC 2, ISO 27001, penetration-test certification, HIPAA or GDPR certification is claimed. See `docs/security/threat-model.md`, `docs/company/vendor-register.md`, and `docs/security/operations.md` for current boundaries and gaps.

## Secret policy

Never commit credentials, .env files, tokens, private keys or provider payloads. `.env.example` contains blank placeholders only. Server configuration imports server-only; never serialize it into client props or responses. NEXT_PUBLIC values are public. Service-role credentials must never have that prefix. If a secret is exposed, revoke/rotate it immediately and coordinate history cleanup.

## Baseline

Security headers include nosniff, frame denial, limited CSP, referrer and permissions policies, and production HSTS. CSP is deliberately partial and does not claim comprehensive script protection; a nonce policy belongs in a future integration review. Public errors are generic. Request IDs are generated internally, not trusted from input. Logging allows only fixed event names and generated identifiers; never pass arbitrary secrets, headers, bodies or stack traces. No eval, debug backdoors or arbitrary execution is introduced.

Qloo HTTP is confined to fixed approved origins and paths; redirects are rejected. Credentials are never logged or returned. Query lengths, UUIDs, five-signal profiles, strict route schemas and bounded response/body sizes are validated. Upstream errors are typed and sanitized; arbitrary metadata is dropped. React renders text rather than raw provider HTML. Evidence scores supplied by callers are rejected. Missing evidence is not a REJECT. Process-local quotas are best-effort, not production distributed abuse protection. A live deployment with a funded key needs quota monitoring before unrestricted traffic. No Qloo raw dumps should be committed.

Pre-key hardening adds a three-second total body-read deadline and five-call ceiling per request-created Qloo transport, without retries. Invalid or slow bodies cannot hold local concurrency slots indefinitely. These limits do not bound account-wide traffic across Vercel instances. Enable platform deployment protection and monitor provider quotas before public credentialed use; origin checks are not authentication or account-wide abuse prevention. Receipt construction checks identity/decision/provenance and snapshots allowlisted fields. No provider request ID or signing guarantee is fabricated.
