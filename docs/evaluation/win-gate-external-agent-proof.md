# External agent obedience proof

The independent caller is examples/win-gate/agent.mjs with obey.mjs. It spawns exactly one fixed M1.6 stdio operation, requests the additive includeContinuation=true option, and uses only the returned decision, permitted continuation and candidate label. Legacy M1.6 responses remain unchanged without that option. No M6 API/SDK, policy engine, Qloo import, threshold or taste scoring exists in the caller.

Run node examples/win-gate/agent.mjs <private-reviewed-proposal.json>. The input uses existing signalIds, identitiesReviewed=true and SELECT_ENTITY action.candidate {id,type}, optional bounded context. No verified IDs are embedded in the example; resolve/review them through the application. No credential in command arguments. The trusted TastePolicy child alone reads private Qloo environment. Timeout 55s, bounded 16 KiB input/64 KiB output, no retry. Output is a sanitized trace, never secret diagnostics.

ALLOW can produce only a demo recommendation/draft. ASK stops with an explicit question and requires a new evaluation after an answer; it never guesses or resumes automatically. REJECT stops and may offer repair. UNAVAILABLE stops, is not dislike and never auto-retries. No transaction occurs. Invalid contracts stop closed.

Automated subprocess proof uses SYNTHETIC TEST DATA: the real accepted M1.6 evaluator receives a test-only injected provider in one process and the independent caller consumes its result in another. Four outcomes are tested. This proves interface obedience, not live Qloo, an LLM agent, authenticated M6 sharing or an actual external commercial agent integration. The Arena's continuation presentation is not falsely described as that separate process.

Current unmocked production path without a Qloo credential stops safely. Live external obedience remains environment-blocked. A live ASK→answer→new-evaluation resume has not been observed and must be captured separately. Use existing M2.5 clarification for state-linked evidence; M1.6 is the bounded stateless cultural interface, not a hidden state/profile API.
