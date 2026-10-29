# TastePolicy A2A / Google distribution package

Status: PROTOCOL_READY; GOOGLE_MARKETPLACE_NOT_SUBMITTED.

## Product identity

**Name:** TastePolicy  
**Category:** Subjective Authority Infrastructure for AI agents  
**One-line description:** Give agents inspectable, revocable boundaries around culturally informed choices.  
**Website:** https://tastepolicy.vercel.app  
**Documentation:** https://tastepolicy.vercel.app/docs  
**Support:** https://tastepolicy.vercel.app/support  
**Privacy:** https://tastepolicy.vercel.app/privacy  
**Terms:** https://tastepolicy.vercel.app/terms  
**Source:** https://github.com/VictorCyberDev/TastePolicy  
**License:** Apache-2.0

Brand assets are available under `public/brand/mark.png` and `public/brand/social-card.png`.

## A2A endpoint

- Agent card: `https://tastepolicy.vercel.app/.well-known/agent-card.json`
- Canonical origin: `https://tastepolicy.vercel.app`

The public card is stable and the protocol path has independent acceptance evidence. TastePolicy's A2A support is an interoperability surface; it is not a claim of acceptance into a Google marketplace or of compatibility with a marketplace that requires a different protocol/version.

## Google ADK integration

`examples/integrations/adk.py` shows the server-side Google ADK route using `McpToolset` and `RemoteA2aAgent`. Keep owner credentials outside prompts and front-end bundles. The same authority invariants apply through Google tooling: ASK is unresolved, REJECT is absolute for an applicable rule, UNAVAILABLE is not dislike, and ALLOW does not authorize payment, booking, messaging, account changes or legal actions.

## Suggested review flow

1. Fetch the public agent card and verify the canonical origin.
2. Authenticate a test owner using the documented server-side route.
3. Inspect current subjective authority and action ceiling.
4. Run one prevalidated ALLOW, one ceiling-driven ASK and one explicit-rule REJECT.
5. Verify a captured receipt/proof without treating verification as execution authority.
6. Attempt a transaction request and confirm TastePolicy does not supply payment/booking authority.

## Distribution boundary

No Google marketplace submission, review, approval or publication is claimed. Marketplace eligibility, current listing fields and any vendor-specific attestations must be checked in the actual authenticated portal before submission. The stable A2A implementation remains usable independently of marketplace status.
