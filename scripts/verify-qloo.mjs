import { readFile } from "node:fs/promises";
import {
  TARGET_DOMAINS,
  validateProfile,
  validateReceipt,
  compareRepeat,
  failureState,
  acceptanceState,
} from "./qloo-proof-contract.mjs";
// Calls only a locally running real app; never reads, transmits or logs credentials.
const base = new URL(
  process.env.QLOO_VERIFY_APP_URL ?? "http://127.0.0.1:3000",
);
if (
  !["127.0.0.1", "localhost"].includes(base.hostname) ||
  base.protocol !== "http:" ||
  base.username ||
  base.password
)
  throw Error("Local HTTP app required");
const signals = [
  { query: "Nils Frahm", expectedType: "artist" },
  { query: "Perfect Days", expectedType: "movie" },
  { query: "Muji", expectedType: "brand" },
  { query: "Piranesi", expectedType: "book" },
  { query: "Severance", expectedType: "tv_show" },
];
let calls = 0;
async function call(operation, body) {
  if (++calls > 10) throw Error("CONTRACT_MISMATCH");
  const response = await fetch(new URL(`/api/demo/${operation}`, base), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25000),
    redirect: "error",
  });
  const result = await response.json();
  if (result.status === "available") {
    if (!response.ok) throw Error("CONTRACT_MISMATCH");
    return result;
  }
  const state = failureState(result);
  if (["NOT_CONFIGURED", "AUTH_FAILED", "CONTRACT_MISMATCH"].includes(state))
    throw Error(state);
  return result;
}
function stop(state) {
  console.log(JSON.stringify({ status: state }));
  process.exitCode = 2;
}
try {
  const resolution = await call("resolve", { signals });
  if (
    resolution.status !== "available" ||
    !Array.isArray(resolution.data) ||
    resolution.data.length !== 5
  )
    throw Error("CONTRACT_MISMATCH");
  const selected = [];
  for (const [i, r] of resolution.data.entries()) {
    if (r.status !== "available") throw Error(failureState(r));
    if (!Array.isArray(r.data?.matches)) throw Error("CONTRACT_MISMATCH");
    const exact = r.data.matches.filter(
      (e) =>
        e.name.toLowerCase() === signals[i].query.toLowerCase() &&
        e.type === signals[i].expectedType &&
        (signals[i].query !== "Perfect Days" || e.releaseYear === 2023),
    );
    if (exact.length !== 1) throw Error("PARTIAL_LIVE_PROOF");
    selected.push(exact[0]);
  }
  validateProfile(selected);
  const signalIds = selected.map((e) => e.id),
    domains = [],
    pool = [];
  for (const targetType of TARGET_DOMAINS) {
    const r = await call("discover", { signalIds, targetType });
    if (r.status !== "available") {
      domains.push({ targetType, status: "unavailable", reason: r.reason });
      continue;
    }
    const candidates = r.data?.candidates;
    if (
      !Array.isArray(candidates) ||
      !candidates.length ||
      candidates.length > 8 ||
      candidates.some(
        (c) =>
          c.entity?.type !== targetType || !Number.isFinite(c.alignmentScore),
      )
    )
      throw Error("CONTRACT_MISMATCH");
    domains.push({
      targetType,
      status: "available",
      candidates: candidates.map((c) => ({
        name: c.entity.name,
        type: c.entity.type,
        id: c.entity.id,
        rank: c.rank,
        rawAffinity: c.rawAffinity,
        alignmentScore: c.alignmentScore,
        scale: c.scale,
        explainability: c.explainability.status,
      })),
    });
    pool.push(...candidates);
  }
  // Predeclared sampling strategy: high, median, low discovery alignment. Cross-domain
  // comparisons here select coverage only; they do not establish score comparability.
  const unique = [...new Map(pool.map((c) => [c.entity.id, c])).values()].sort(
    (a, b) => b.alignmentScore - a.alignmentScore,
  );
  if (unique.length < 3) throw Error("PARTIAL_LIVE_PROOF");
  const chosen = [
    unique[0],
    unique[Math.floor(unique.length / 2)],
    unique[unique.length - 1],
  ];
  const receipts = [];
  for (const candidate of chosen) {
    const r = await call("evaluate", {
      signalIds,
      candidateId: candidate.entity.id,
      context: "Predeclared high/median/low live verification sample",
    });
    if (r.status !== "available") throw Error("PARTIAL_LIVE_PROOF");
    receipts.push(validateReceipt(r.data, selected, candidate.entity));
  }
  const r = await call("evaluate", {
    signalIds,
    candidateId: chosen[0].entity.id,
    context: "Repeat live verification sample",
  });
  if (r.status !== "available") throw Error("PARTIAL_LIVE_PROOF");
  const repeat = compareRepeat(
    receipts[0],
    validateReceipt(r.data, selected, chosen[0].entity),
  );
  const first = receipts[0],
    sameContract = receipts.every(
      (r) =>
        r.qlooEvidence.scale === first.qlooEvidence.scale &&
        r.qlooEvidence.provenance.host === first.qlooEvidence.provenance.host &&
        r.policyVersion === first.policyVersion,
    );
  let review;
  if (process.env.QLOO_VERIFY_REVIEW_FILE)
    review = JSON.parse(
      await readFile(process.env.QLOO_VERIFY_REVIEW_FILE, "utf8"),
    );
  const status = acceptanceState(
    {
      domainsProbed: domains.length,
      evaluations: receipts.length,
      stableRepeat: Object.values(repeat).every(Boolean),
      contractsValid:
        sameContract &&
        receipts.every((r) =>
          r.explainability.status === "unavailable"
            ? !["unsupported_shape", "malformed_contribution"].includes(
                r.explainability.reason,
              )
            : !r.explainability.issues.includes("malformed_contribution"),
        ),
      liveEvidence: true,
      scale: first.qlooEvidence.scale,
      host: first.qlooEvidence.provenance.host,
      policyVersion: first.policyVersion,
      signalIds,
    },
    review,
  );
  console.log(
    JSON.stringify(
      {
        status,
        timestamp: new Date().toISOString(),
        signals: selected,
        domains,
        receipts,
        repeat,
        note: "Normalized evidence only. Review wire semantics, identities, live UI and threshold rationale before acceptance.",
      },
      null,
      2,
    ),
  );
  process.exitCode = status === "LIVE_ACCEPTANCE_PASSED" ? 0 : 2;
} catch (error) {
  const allowed = [
    "NOT_CONFIGURED",
    "AUTH_FAILED",
    "CONTRACT_MISMATCH",
    "PARTIAL_LIVE_PROOF",
  ];
  stop(allowed.includes(error?.message) ? error.message : "CONTRACT_MISMATCH");
}
