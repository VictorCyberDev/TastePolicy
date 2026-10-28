# TastePolicy investor memo

Working diligence draft, 2026-10-28. Read together with the release ledger and `company-brief.md`. Engineering evidence, targets and unvalidated assumptions are separate throughout.

## Thesis and problem

Agents increasingly retrieve personal context and use tools. A preference in memory can be stale, context-specific or contradicted by an explicit rule. IAM can permit a tool call while saying nothing about whether choosing this restaurant is justified for this person. TastePolicy's proposed category is Subjective Authority Infrastructure: explicit preference state, evidence, decision rights and bounded continuation attached to a subjective choice.

Qloo gives agents taste. TastePolicy gives that taste authority boundaries. The company must earn its position by making those boundaries useful and dependable in integrations. A new category name alone establishes no buyer budget.

## Why now

[OpenAI's Apps SDK announcement](https://openai.com/index/introducing-apps-in-chatgpt/) describes conversational apps built on MCP. [Official ChatGPT release notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes) document the directory and app submissions. These are distribution mechanisms, not evidence of TastePolicy adoption or a partnership. [Stanford's 2026 AI Index](https://hai.stanford.edu/ai-index/2026-ai-index-report/economy) reports broad organizational AI usage while agent deployment remains early across most business functions. This supports an emerging workflow hypothesis, not a proven immediate mass market.

## Product and architecture

A developer enrolls reviewed cultural identities into a private Passport, issues a scoped credential, and presents a candidate with context and requested subjective action. Qloo supplies entity/affinity evidence. Deterministic policy resolves explicit constraints and ceilings. The service captures a receipt, can issue a bounded lease, and can issue portable authority proofs with candidate/context commitments and revocable epochs. REST, remote MCP and A2A use shared authority services. A TypeScript client and independent verifier expose those contracts.

State, grants, policy versions, credentials, decisions, leases and proofs have separate lifecycles. Replays preserve captured inputs. Fresh authority checks can reject a stale/revoked lease even when its historic receipt is valid. Issuer discovery does not grant trust. Payment, account access, booking, private-data disclosure and legal action require separate execution authorization.

Canonical production is `https://tastepolicy.vercel.app`. See the company ledger for exact deployment/commit/acceptance evidence. Production hosting exists, but the full company definition of done is still open: multi-tenant commercial onboarding, billing, continuous operational monitoring, real assistant use and distribution approvals are not complete.

## Wedge and buyer

Start with place recommendations inside travel/concierge agent products. A qualified buyer already has real proposal traffic, an identifiable engineering owner, a need for user-specific pauses/stops and a separate execution boundary. The pilot scope is one application, one candidate domain, a fixed trial period and explicit success criteria. Exclude teams asking TastePolicy to authorize spending or provide unlicensed Qloo access.

Developer adoption starts with public examples and a usable credential-to-first-decision path. Enterprise expansion requires organization access controls, a negotiated data contract, proof of recovery and observed reliability. Those are funded milestones, not features promised as delivered.

## Market model

No independent census of companies buying subjective-authority infrastructure is available. The bottom-up scenario in `market-and-economics.json` uses the [BLS 2024 software developer employment count](https://www.bls.gov/ooh/computer-and-information-technology/software-developers.htm), 1,693,800 US jobs, as a broad capacity proxy. Dividing jobs into assumed ten-developer teams yields 169,380 possible team equivalents. At a hypothetical USD588 annual workspace subscription, the broad proxy is USD99.60 million/year. Assuming 10% build a relevant workflow yields a USD9.96 million serviceable scenario. Neither number is an observed TAM or customer count; jobs are not buyers, multiple workspaces overlap, and willingness to pay is unvalidated. Global enterprise pricing could change the model and must be researched rather than multiplied into a speculative billion-dollar claim.

Near-term SOM target is 100 paying workspaces at USD49/month, or USD58,800 annualized subscription revenue before churn, discounts and variable costs. This is an adoption experiment. See the conversion sensitivities in `go-to-market.md`; 100 paying customers is not a credible 90-day forecast without measured funnel evidence.

## Competition and differentiation

| Alternative               | Buyer value                                     | TastePolicy's proposed distinction / proof required                                                                                             |
| ------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Prompt plus agent memory  | Simple personalization with little integration  | Explicit provenance, applicability, revocation and machine-checkable ceilings. Must beat an equally informed prompt baseline in held-out tests. |
| Qloo recommendation alone | Cultural entity discovery and affinity          | User authorization is separately modeled. No claim that Qloo is incapable of adding policy products.                                            |
| Deterministic rules alone | Clear hard constraints, low provider dependence | Qloo evidence plus bounded uncertainty handling. Benchmark the incremental relevance/cost, not only rule compliance.                            |
| Cerbos / Oso / AuthZed    | Mature operational authorization and governance | Subjective preference semantics and cultural evidence. Complementary IAM remains required. These vendors have broader existing operations.      |
| Internal agent guardrails | Team-specific checks near the tool              | Portable receipts/commitments and shared consent lifecycle. Integration cost and usability must be demonstrated.                                |

Sources and current price units are recorded in `docs/company/pricing-research.md`. No feature-complete audit or competitive victory is asserted.

## Evidence and defensibility

Engineering proof includes production auth/OAuth, isolated credentials, Qloo provenance, lease/epoch/commitment tests, independent protocol clients and conformance vectors. The existing 24-scenario TasteBench engineering contract is reproducible but small. A ten-person descriptive pilot has weak exact agreement and substantial missed ASK. Human assurance relies on the supplied operator assertion. Reported judgments are repeated observations, not independent participants. There is no controlled generic-LLM versus Qloo versus TastePolicy outcome study establishing superiority.

Potential compounding value lies in reliable integrations, transparent authority history and legitimate consented evaluation data. Cultural graph IP belongs to Qloo. Apache-licensed source and portable/deletable state limit lock-in and support adoption. No patents, exclusive provider agreement or proprietary dataset moat are claimed.

## Business and economics

Free developer usage establishes integration value within protective limits. Pro USD49/month is a test price informed by comparable authorization developer plans. Enterprise pricing requires negotiated deployment/support/data scope. Qloo commercial price, provider calls per decision, support cost and payment fees remain unknown; therefore gross margin, CAC, LTV and payback are not reported as facts. Cost sensitivity is explicit in the companion model. Do not offer unlimited decisions before contractual cost and capacity measurements.

## Fundraising scenario and milestones

Planning scenario: USD500,000 over 18 months, with USD50,000 held as contingency. Remaining USD450,000 implies an average USD25,000/month operating budget. Proposed allocation: USD275,000 product/engineering, USD75,000 licensed infrastructure/provider and reliability, USD50,000 security/legal/privacy work, USD50,000 customer discovery/distribution, USD50,000 reserve. These totals are hypothetical budget envelopes, not salaries, vendor quotes, spend authority or an approved capitalization plan.

Hiring sequence: founder continues product ownership; first incremental role is an engineer responsible for integrations/reliability, then fractional privacy/security/legal specialists, then customer success or developer relations only after repeatable demand. No employee or advisor currently exists merely because a role appears here.

Funding milestones: written Qloo commercial terms; full self-serve workspace and tested sandbox billing; real ChatGPT and Claude evidence; submitted listings; isolated recovery exercise and privacy-respecting monitoring; independently labeled held-out evaluation; ten qualified design partners and first validated paid conversion cohort. Later scale target is 100 retained paying customers, contingent on conversion and unit economics.

## Risks and kill criteria

Provider permission/cost may make resale uneconomic. Platform identity/review can delay distribution. Human labels may expose semantics that users do not understand. Explicit onboarding may be too burdensome. A simple prompt/rules integration may suffice. Tenant/auth/proof bugs could expose sensitive preferences or overstate authority. Privacy and international transfer obligations require jurisdiction-specific review; no compliance certification is claimed. Founder concentration, lack of recovery rehearsal and no staffed support constrain enterprise readiness.

Pause expansion if buyers cannot identify a funded problem, equivalent baselines achieve the same control with less integration effort, missed ASK remains high on legitimate held-out evidence, or contracted provider economics cannot support the service. Funding should test these questions, not treat them as settled.
