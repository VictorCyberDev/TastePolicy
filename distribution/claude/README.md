# Claude connector distribution package

Status: CUSTOM_CONNECTOR_READY; DIRECTORY_NOT_SUBMITTED; DIRECTORY_PAID_PLAN_GATE_OBSERVED.

## Listing

**Name:** TastePolicy  
**One-line description:** Subjective authority boundaries for AI agents using Qloo cultural evidence.  
**Long description:** TastePolicy lets an owner connect a private TastePolicy Passport to an AI assistant, inspect explicit preference rules and action ceilings, evaluate a reviewed candidate with Qloo cultural evidence, and inspect receipts, leases and portable proofs. ALLOW, ASK, REJECT and UNAVAILABLE remain distinct. Preference authority never grants payment, booking, messaging, account-change or legal execution authority.

**Website:** https://tastepolicy.vercel.app  
**MCP:** https://tastepolicy.vercel.app/api/mcp  
**Support:** https://tastepolicy.vercel.app/support  
**Privacy:** https://tastepolicy.vercel.app/privacy  
**Terms:** https://tastepolicy.vercel.app/terms  
**Source:** https://github.com/VictorCyberDev/TastePolicy  
**License:** Apache-2.0

## Authentication

Remote MCP uses OAuth authorization code + PKCE S256 and the protected resource `https://tastepolicy.vercel.app/api/mcp`. The owner must authenticate to TastePolicy and consent to the requested scopes. Tokens are resource-bound; refresh tokens rotate and reuse revokes the family.

## Suggested prompts

1. Show my current TastePolicy authority and action ceiling.
2. Check this reviewed candidate against my saved taste rules.
3. Explain the Qloo evidence and boundary behind this receipt.
4. Verify whether this captured lease/proof is still valid for the original candidate and context.

## Review cases

Positive:

1. Inspect owned authority/policy without inventing access.
2. Return ALLOW for a prevalidated aligned fixture, or UNAVAILABLE if required evidence cannot be obtained.
3. Return ASK when the requested action exceeds the saved ceiling.
4. Return REJECT for an explicit saved exclusion even with strong Qloo affinity.
5. Inspect receipt + bounded lease/proof while preserving verification != execution authority.

Negative:

1. Do not book/pay because an evaluation returned ALLOW.
2. Do not expose another owner's Passport without a grant.
3. Do not accept a partial commitment or a revoked/stale authority epoch.

## Current evidence boundary

The custom connector has reached TastePolicy OAuth consent in a real Claude session. Completion of recent owner authentication, authorization and actual tool invocation remains unproved. The directory portal observed on 2026-10-29 required a paid eligible Claude plan for directory submissions. No paid upgrade, directory submission, approval or publication is claimed.
