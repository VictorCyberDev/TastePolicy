import { App } from "@modelcontextprotocol/ext-apps";
const app = new App({ name: "TastePolicy Authority Card", version: "1.0.0" });
const field = (id: string, value: unknown) => {
  const el = document.getElementById(id);
  if (el)
    el.textContent =
      typeof value === "string"
        ? value
        : JSON.stringify(value ?? "Not supplied", null, 2);
};
let input: Record<string, unknown> = {},
  last: Record<string, unknown> = {};
const object = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
function render() {
  const proposal = object(input.proposal),
    policy = object(last.policy),
    action = object(policy.action),
    evidence = object(last.authorizationEvidence),
    choice = object(proposal.candidate),
    lease = last.leaseRef ? last : {};
  field(
    "decision",
    last.decision ?? last.status ?? "Waiting for a tool result",
  );
  field(
    "requested",
    input.requestedAction ??
      last.requestedAction ??
      "Legacy cultural continuation",
  );
  field(
    "agent",
    proposal.agentId ?? evidence.agentId ?? last.agentId ?? "Not supplied",
  );
  field(
    "subject",
    last.subjectRef ?? last.passportRef ?? input.passportRef ?? "Not supplied",
  );
  field(
    "candidate",
    choice.name ??
      last.candidateName ??
      object(object(evidence.action).candidate).name ??
      "Not supplied",
  );
  field(
    "context",
    proposal.context ?? evidence.context ?? last.contextKey ?? "Not supplied",
  );
  field(
    "ceiling",
    action.ceiling ??
      action.permitted ??
      object(last.continuation).permittedActions ??
      last.permittedActions ??
      "Inspect the resolved policy",
  );
  field(
    "explanation",
    last.ask ??
      last.unresolvedFactors ??
      last.reasons ??
      "Inspect the recorded receipt and rule trace.",
  );
  field(
    "qloo",
    evidence.cultural ??
      "Cultural detail is not in this summary. Inspect the authorized receipt; no affinity is invented here.",
  );
  field("rules", policy.trace ?? policy ?? "Not supplied");
  field(
    "receipt",
    last.receiptRef ?? last.evaluationRef ?? "No receipt supplied",
  );
  field("lease", lease.status ?? "No lease in this result");
  field(
    "proof",
    last.attestation
      ? `Issued until ${String(last.expiresAt ?? "unspecified")}; verification still required`
      : last.signature
        ? {
            signature: last.signature,
            trust: last.issuerTrust,
            valid: last.valid,
          }
        : "No proof in this result",
  );
  field("raw", last);
  const inspect = document.getElementById("inspect") as HTMLButtonElement;
  inspect.disabled =
    typeof (last.evaluationRef ?? last.receiptRef) !== "string";
  const decision = document.getElementById("decision");
  if (decision)
    decision.dataset.decision = String(last.decision ?? last.status ?? "");
}
app.ontoolinput = (params) => {
  input = params.arguments ?? {};
  render();
};
app.ontoolresult = (result) => {
  if (result.structuredContent) last = object(result.structuredContent);
  else {
    const text = result.content?.find((c) => c.type === "text");
    try {
      last = object(
        JSON.parse(text && "text" in text ? String(text.text) : "{}"),
      );
    } catch {
      last = { code: "UNREADABLE_TOOL_RESULT" };
    }
  }
  render();
};
document.getElementById("inspect")?.addEventListener("click", async () => {
  const button = document.getElementById("inspect") as HTMLButtonElement;
  button.disabled = true;
  field("notice", "Reading the authorized captured receipt…");
  try {
    const result = await app.callServerTool({
      name: "tastepolicy_get_receipt",
      arguments: { evaluationRef: last.evaluationRef ?? last.receiptRef },
    });
    if (result.isError) {
      field(
        "notice",
        "Receipt access stopped. The credential may not have RECEIPT_READ scope.",
      );
      return;
    }
    last = object(result.structuredContent);
    render();
    field(
      "notice",
      "Captured receipt loaded. Verification is not authorization.",
    );
  } catch {
    field(
      "notice",
      "The host could not read the receipt. No new authority was issued.",
    );
  } finally {
    button.disabled = false;
  }
});
app
  .connect()
  .catch(() =>
    field(
      "notice",
      "This view needs an MCP Apps host. Use the tool’s text result when interactive rendering is unavailable.",
    ),
  );
