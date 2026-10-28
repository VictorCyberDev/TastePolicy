# ADR 0026 — A2A authority-lifecycle extension

Status: accepted (final reconciliation). Builds on ADR 0013.

The A2A 1.0 specification (normative `a2a.proto`) defines `AgentCapabilities.extensions[]` of `AgentExtension {uri, description, required, params}`, `Message.extensions[]` and the `A2A-Extensions` service parameter. It has no field that selects a skill.

- Extension URI `https://tastepolicy.dev/a2a/ext/authority-lifecycle/v1`, declared `required: false`. Without activation a SendMessage data part is an evaluation exactly as before.
- Activated by `message.extensions` or the `A2A-Extensions` header, the data part names an `operation`: `evaluate`, `lease.request|verify|checkpoint|resume|release`, `attestation.issue|verify`. Each is the same gateway tool REST, MCP and the SDK use; scopes are enforced per tool.
- Tasks: lease tasks use the lease reference as task id; a pending owner question is `TASK_STATE_INPUT_REQUIRED`; GetTask reads the authoritative lease verify; CancelTask releases the lease.
- Handoff: `attestation.issue` with `holderKey` (the receiver's public key) and `delegateAgentId`; the proof travels agent to agent in an ordinary A2A message (media type `application/vnd.tastepolicy.attestation+sd-jwt`); the receiver verifies with `attestation.verify` (any valid credential) or the credential-free public verifier. The receiver learns the bounded actions and nothing about the person; payment, booking and execution authority are never conveyed.
- Not claimed: streaming, push notifications, interoperability with any third-party A2A product. Gemini Enterprise A2A is not supported. Tests: `tests/a2a-authority.test.ts` (two agents, drift, resume, replay, wrong holder, cross-surface equivalence).
