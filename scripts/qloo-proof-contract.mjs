// Provider-neutral assertions over normalized public API output. No credentials,
// live networking, recorded provider dumps, or synthetic fallback exist here.
export const TARGET_DOMAINS = ["destination", "place", "brand"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function assert(condition) {
  if (!condition) throw Error("CONTRACT_MISMATCH");
}
export function validateProfile(entities) {
  assert(Array.isArray(entities) && entities.length === 5);
  assert(
    entities.every(
      (e) =>
        UUID.test(e.id) &&
        typeof e.name === "string" &&
        e.name.length > 0 &&
        [
          "artist",
          "book",
          "brand",
          "destination",
          "movie",
          "place",
          "tv_show",
        ].includes(e.type),
    ),
  );
  assert(new Set(entities.map((e) => e.id.toLowerCase())).size === 5);
  assert(new Set(entities.map((e) => e.type)).size >= 3);
  return entities;
}
export function validateReceipt(receipt, signals, candidate) {
  validateProfile(signals);
  assert(
    receipt?.schemaVersion === "cultural-receipt-v1" &&
      receipt.normalizationVersion === "affinity-explicit-scale-v1",
  );
  assert(
    typeof receipt.policyVersion === "string" &&
      receipt.policyVersion.length > 0,
  );
  assert(
    UUID.test(receipt.receiptId) &&
      UUID.test(receipt.requestId) &&
      Number.isFinite(Date.parse(receipt.evaluatedAt)),
  );
  assert(
    receipt.action?.kind === "SELECT_ENTITY" &&
      receipt.action.targetEntity.id === candidate.id &&
      receipt.action.targetEntity.type === candidate.type,
  );
  assert(
    receipt.candidate?.id === candidate.id &&
      receipt.candidate.type === candidate.type &&
      !signals.some((s) => s.id === candidate.id),
  );
  assert(
    receipt.inputSignals?.length === 5 &&
      receipt.inputSignals.every(
        (s, i) => s.id === signals[i].id && s.type === signals[i].type,
      ),
  );
  const evidence = receipt.qlooEvidence,
    raw = evidence?.rawAffinity,
    scale = evidence?.scale;
  assert(
    ["unit", "percent"].includes(scale) &&
      typeof raw === "number" &&
      Number.isFinite(raw),
  );
  const maximum = scale === "unit" ? 1 : 100;
  assert(
    raw >= 0 && raw <= maximum && receipt.alignmentScore === raw / maximum,
  );
  const p = receipt.policy;
  assert(
    p &&
      Number.isFinite(p.allowAbove) &&
      Number.isFinite(p.rejectBelow) &&
      p.rejectBelow >= 0 &&
      p.allowAbove <= 1 &&
      p.rejectBelow <= p.allowAbove,
  );
  const outcome =
    receipt.alignmentScore > p.allowAbove
      ? "ALLOW"
      : receipt.alignmentScore < p.rejectBelow
        ? "REJECT"
        : "ASK";
  const reason =
    outcome === "ALLOW"
      ? "STRONG_ALIGNMENT"
      : outcome === "REJECT"
        ? "WEAK_ALIGNMENT"
        : "UNCERTAIN_ALIGNMENT";
  assert(
    receipt.decision?.outcome === outcome &&
      receipt.decision.reasonCode === reason,
  );
  const provenance = evidence.provenance;
  assert(
    provenance?.provider === "qloo" &&
      provenance.endpoint === "/v2/insights" &&
      ["https://hackathon.api.qloo.com", "https://api.qloo.com"].includes(
        provenance.host,
      ) &&
      Number.isFinite(Date.parse(provenance.fetchedAt)),
  );
  assert(
    provenance.specificCandidateId === candidate.id &&
      provenance.targetType === candidate.type &&
      provenance.signalIds?.length === 5 &&
      provenance.signalIds.every((id, i) => id === signals[i].id),
  );
  const explanation = receipt.explainability;
  assert(
    explanation &&
      ["complete", "partial", "unavailable"].includes(explanation.status),
  );
  if (explanation.status === "unavailable")
    assert(
      [
        "not_returned",
        "provider_warning",
        "unsupported_shape",
        "malformed_contribution",
      ].includes(explanation.reason),
    );
  else {
    const contributions = explanation.contributions;
    assert(
      Array.isArray(contributions) &&
        contributions.every(
          (c) =>
            signals.some((s) => s.id === c.signalId) &&
            typeof c.score === "number" &&
            Number.isFinite(c.score) &&
            c.score >= 0 &&
            c.score <= 1,
        ),
    );
    assert(
      new Set(contributions.map((c) => c.signalId)).size ===
        contributions.length,
    );
    const missing = signals
      .map((s) => s.id)
      .filter((id) => !contributions.some((c) => c.signalId === id));
    assert(
      Array.isArray(explanation.missingSignalIds) &&
        explanation.missingSignalIds.length === missing.length &&
        new Set(explanation.missingSignalIds).size === missing.length &&
        explanation.missingSignalIds.every((id) => missing.includes(id)),
    );
    assert(
      Array.isArray(explanation.omittedSignalIds) &&
        new Set(explanation.omittedSignalIds).size ===
          explanation.omittedSignalIds.length &&
        explanation.omittedSignalIds.every((id) => missing.includes(id)),
    );
    assert(
      Array.isArray(explanation.issues) &&
        explanation.issues.every((i) =>
          [
            "missing_signals",
            "malformed_contribution",
            "provider_warning",
          ].includes(i),
        ),
    );
    const unknownMissing = missing.some(
      (id) => !explanation.omittedSignalIds.includes(id),
    );
    assert(!unknownMissing || explanation.issues.includes("missing_signals"));
    assert(
      explanation.status ===
        (explanation.issues.length ? "partial" : "complete"),
    );
    assert(
      explanation.omission ===
        (explanation.omittedSignalIds.length
          ? "explicit_provider_omission"
          : missing.length
            ? "unknown"
            : "none"),
    );
  }
  return receipt;
}
export function compareRepeat(first, second) {
  return {
    sameScore: first.alignmentScore === second.alignmentScore,
    sameDecision: first.decision.outcome === second.decision.outcome,
    sameScale: first.qlooEvidence.scale === second.qlooEvidence.scale,
    samePolicy:
      first.policyVersion === second.policyVersion &&
      first.policy.allowAbove === second.policy.allowAbove &&
      first.policy.rejectBelow === second.policy.rejectBelow,
    sameExplainability:
      JSON.stringify(first.explainability) ===
      JSON.stringify(second.explainability),
  };
}
export function failureState(result) {
  assert(
    result &&
      result.status === "unavailable" &&
      !result.decision &&
      !result.data?.decision,
  );
  if (result.reason === "not_configured") return "NOT_CONFIGURED";
  if (result.reason === "auth_failed") return "AUTH_FAILED";
  if (result.reason === "invalid_response") return "CONTRACT_MISMATCH";
  return "PARTIAL_LIVE_PROOF";
}
// API evidence alone cannot establish host wire semantics, UI behavior, calibration,
// or human identity review. The runner requires a reviewed, sanitized local record.
export function acceptanceState(summary, review) {
  const technical =
    summary.domainsProbed === 3 &&
    summary.evaluations >= 3 &&
    summary.stableRepeat &&
    summary.contractsValid &&
    summary.liveEvidence;
  const reviewed =
    review?.wireContractVerified === true &&
    review?.canonicalIdentitiesReviewed === true &&
    review?.fullLiveUiVerified === true &&
    review?.thresholdsReviewed === true &&
    review?.scaleVerified === summary.scale &&
    review?.host === summary.host &&
    review?.policyVersion === summary.policyVersion &&
    review?.signalIds?.length === 5 &&
    review.signalIds.every((id, i) => id === summary.signalIds[i]) &&
    typeof review.reviewedAt === "string" &&
    Number.isFinite(Date.parse(review.reviewedAt));
  return technical && reviewed
    ? "LIVE_ACCEPTANCE_PASSED"
    : "PARTIAL_LIVE_PROOF";
}
