# Pricing and unit economics — 2026-10-28

Status: commercial design hypothesis. No paid plan, invoice, subscription, provider approval or margin is established by this document.

## Comparable products

Official public pages checked on 2026-10-28:

| Product                                         | Published unit / entry                                                                                       | Implication for TastePolicy                                                                                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Cerbos](https://www.cerbos.dev/pricing)        | Free proof of concept; Development from USD25/month; Production from USD933/month; monthly active principals | Authorization buyers distinguish experimentation from production operations. Their principal counts and features are not equivalent to our decisions.   |
| [Oso for Agents](https://www.osohq.com/pricing) | Developer USD0/user/month; Growth USD15/user/month; enterprise custom                                        | Seats can price governance and support, but do not cap our Qloo cost exposure.                                                                          |
| [AuthZed](https://authzed.com/pricing)          | Cloud infrastructure from USD2/hour; custom dedicated capacity                                               | Infrastructure capacity is another pricing unit. This is not a like-for-like feature comparison.                                                        |
| [Qloo API](https://www.qloo.com/products/api)   | Official demo/contact path; no numeric API price established                                                 | TastePolicy cannot quote a sustainable all-inclusive provider allowance before receiving commercial terms. Commercial inquiry sent; permission pending. |

## Proposed packaging

Developer: free, one owner workspace, explicit daily admission cap, no SLA. The currently enforced limit is 100 evaluation admissions per Passport owner per UTC day and 30 credential-authenticated requests per minute. Replays with an already captured result avoid a new evaluation; concurrent or failed preflight/provider attempts can consume admission budget. This is a protective quota, not an invoice meter.

Pro: USD49/workspace/month is a **test price**, selected above the published USD25 developer control-plane anchor while remaining an accessible small-team purchase. Proposed inclusion is 1,000 captured decisions/month, with provider cost excluded until Qloo pricing/rights are agreed. No checkout is currently offered and no entitlement is unlocked by this document. Validate willingness to pay in at least ten buyer interviews before finalizing. Enterprise uses a negotiated annual contract with a scoped deployment, retention/support terms and provider rights.

Proposed billable unit: one newly captured evaluation identified by its immutable evaluation reference. Idempotent replay, receipt reads and verification reads must not create another billable decision. UNAVAILABLE is displayed in usage but should be nonbillable. Payment, booking and legal execution remain outside the product. Admission reservations, settlement/refund, plan enforcement, invoices, signed provider webhooks and sandbox acceptance remain implementation requirements in M20.

## Cost sensitivity

Let D be monthly captured decisions, A provider calls per decision, C the contracted cost per call, H allocated hosting/database cost, and S allocated support cost. Contribution before fixed expenses = subscription revenue − D×A×C − H − S − payment fees. Qloo C, real A distribution and support demand are unknown. Do not publish a gross-margin percentage or offer unlimited usage.

Illustrative USD49/month account at 1,000 decisions and two provider calls per decision: provider cost is USD2 at C=0.001, USD20 at C=0.01, and USD100 at C=0.05, before hosting/support/fees. These are sensitivity inputs, not Qloo quotes. A viable release needs contractual provider pricing, measured calls, hard limits and a tested downgrade/overage path.
