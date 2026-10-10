// Live integration runner: calls a locally running app; does not read or transmit credentials.
const base = new URL(
  process.env.QLOO_VERIFY_APP_URL ?? "http://127.0.0.1:3000",
);
if (
  !["127.0.0.1", "localhost"].includes(base.hostname) ||
  base.protocol !== "http:"
)
  throw new Error("Live verification requires a local HTTP app");
const signals = [
  { query: "Radiohead", expectedType: "artist" },
  { query: "Dune", expectedType: "movie" },
  { query: "Aesop", expectedType: "brand" },
  { query: "The Bear", expectedType: "tv_show" },
  { query: "Blue Bottle Coffee", expectedType: "brand" },
];
async function call(operation, body) {
  const response = await fetch(new URL(`/api/demo/${operation}`, base), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45000),
  });
  const result = await response.json();
  if (result.status !== "available") {
    console.log(
      JSON.stringify({
        status: "blocked",
        reason: result.reason ?? result.code,
      }),
    );
    process.exit(2);
  }
  return result.data;
}
const resolutions = await call("resolve", { signals });
const selected = [];
for (const [i, r] of resolutions.entries()) {
  if (r.status !== "available") {
    console.log(
      JSON.stringify({
        status: "BLOCKED_ON_QLOO_CREDENTIAL_OR_CONFIGURATION",
        reason: r.reason,
      }),
    );
    process.exit(2);
  }
  const matches = r.data.matches.filter(
    (e) =>
      e.name.toLowerCase() === signals[i].query.toLowerCase() &&
      (signals[i].query !== "Dune" || e.releaseYear === 2021),
  );
  if (matches.length !== 1) {
    console.log(
      JSON.stringify({
        status: "CANONICAL_RESOLUTION_REQUIRES_REVIEW",
        query: signals[i],
        matches: r.data.matches,
      }),
    );
    process.exit(2);
  }
  selected.push(matches[0]);
}
const signalIds = selected.map((e) => e.id);
const discovery = await call("discover", {
  signalIds,
  targetType: "destination",
});
const candidate = discovery.candidates[0].entity; // Proposed demo action only; server separately evaluates this ID.
const receipt = await call("evaluate", {
  signalIds,
  candidateId: candidate.id,
  context: "Canonical live vertical-slice verification",
});
const repeat = await call("evaluate", {
  signalIds,
  candidateId: candidate.id,
  context: "Canonical live vertical-slice verification",
});
console.log(
  JSON.stringify(
    {
      status: "live_verified",
      timestamp: new Date().toISOString(),
      signals: selected,
      targetType: "destination",
      candidate,
      receipt,
      repeat: {
        alignmentScore: repeat.alignmentScore,
        decision: repeat.decision,
        explainability: repeat.explainability.status,
      },
    },
    null,
    2,
  ),
);
