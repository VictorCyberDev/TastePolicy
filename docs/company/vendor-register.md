# Vendor and subprocessor register

Version 2026-10-29. This records observed use, not vendor certifications or signed DPAs.

| Provider           | Purpose                                       | Data exposed                                                                                       | Control / unresolved item                                                                                               |
| ------------------ | --------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Vercel             | Next.js hosting, TLS, builds and runtime logs | Requests, auth cookies in transit, server configuration, app responses                             | Environment-scoped secrets; audit log/log retention and DPA need verification                                           |
| Neon               | PostgreSQL application persistence            | Account auth records, cultural state, decisions, credentials hashed at rest, lease/proof records   | Dedicated production DB/role/branch; exact backup/recovery retention and restore rehearsal remain open                  |
| Qloo               | Cultural entities and affinity evidence       | Cultural queries/entity arrays/category/context; never intended to receive identity or credentials | Hackathon access only; commercial permission, receipt retention and redistribution inquiry sent                         |
| GitHub             | Source, CI and public technical evidence      | Public code/docs, synthetic test data and build logs                                               | Pinned Gitleaks source/history CI passed on main 035a768 and billing candidate f3ca65e; no absence-of-secrets guarantee |
| Wikimedia Commons  | Optional place photography                    | Public media queries and browser image requests                                                    | Per-image source/creator/license; context is not verified venue identity                                                |
| OpenAI / Anthropic | Optional user-connected assistants            | Tool inputs and scoped outputs selected by the user                                                | Not commissioned in this browser; provider terms and user consent apply                                                 |
| Google Gmail       | Founder support and commercial correspondence | Contact email and correspondence                                                                   | Founder mailbox, no dedicated company support SLA                                                                       |

Stripe: TEST adapter implemented but no provider account or keys commissioned. If enabled, Stripe receives random workspace metadata and test checkout/subscription events; the application does not collect card data. Provider terms, account identity, DPA, location and retention remain unverified.

Payment provider: none commissioned. No customer billing data processor is claimed. Add a vendor only when actually enabled; record geography, contractual DPA, subprocessors, deletion and incident-notification terms before enterprise contracting.
