// Live public production probe. Uses only five public cultural anchors, never
// credentials or user preferences. No provider result is synthesized/retried.
import { writeFile } from "node:fs/promises";
const base = new URL(process.env.BASE_URL ?? "https://tastepolicy.vercel.app");
if (base.protocol !== "https:" || base.username || base.password)
  throw Error("HTTPS origin required");
const signals = [
  { query: "Nils Frahm", expectedType: "artist" },
  { query: "Perfect Days", expectedType: "movie" },
  { query: "Muji", expectedType: "brand" },
  { query: "Piranesi", expectedType: "book" },
  { query: "Severance", expectedType: "tv_show" },
];
const evidence = {
  kind: "LIVE_PRODUCTION",
  origin: base.origin,
  at: new Date().toISOString(),
  results: [],
};
async function call(op, body) {
  const r = await fetch(new URL(`/api/demo/${op}`, base), {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base.origin },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
    redirect: "error",
  });
  const data = await r.json();
  if (!r.ok || data.status !== "available")
    throw Error(`${op}:${r.status}:${data.reason ?? data.code ?? data.status}`);
  return data.data;
}
try {
  const resolution = await call("resolve", { signals });
  const selected = signals.map((s, i) => {
    const matches = resolution[i]?.data?.matches?.filter(
      (e) =>
        e.name.toLowerCase() === s.query.toLowerCase() &&
        e.type === s.expectedType &&
        (s.query !== "Perfect Days" || e.releaseYear === 2023),
    );
    if (resolution[i]?.status !== "available" || matches?.length !== 1)
      throw Error("Ambiguous public identity");
    return matches[0];
  });
  const signalIds = selected.map((e) => e.id);
  evidence.results.push({ step: "resolve", status: "PASS", selected });
  await new Promise((r) => setTimeout(r, 1100));
  const discovery = await call("discover", { signalIds, targetType: "place" });
  if (
    !discovery.candidates?.length ||
    discovery.provenance?.provider !== "qloo"
  )
    throw Error("Missing Qloo candidate/provenance");
  evidence.results.push({
    step: "discover",
    status: "PASS",
    provenance: discovery.provenance,
    candidates: discovery.candidates.map((c) => ({
      entity: c.entity,
      score: c.alignmentScore,
    })),
  });
  await new Promise((r) => setTimeout(r, 1100));
  const receipt = await call("evaluate", {
    signalIds,
    candidateId: discovery.candidates[0].entity.id,
    context: "Public production commissioning using reviewed public anchors",
  });
  if (
    receipt.qlooEvidence?.provenance?.provider !== "qloo" ||
    !receipt.receiptId ||
    !["ALLOW", "ASK", "REJECT"].includes(receipt.decision?.outcome)
  )
    throw Error("Invalid live receipt");
  evidence.results.push({ step: "evaluate", status: "PASS", receipt });
  evidence.status = "PASS";
} catch (e) {
  evidence.status = "FAIL_REPAIR_REQUIRED";
  evidence.error = e instanceof Error ? e.message : "probe failure";
  process.exitCode = 1;
}
const text = JSON.stringify(evidence, null, 2) + "\n";
if (process.env.EVIDENCE_FILE) await writeFile(process.env.EVIDENCE_FILE, text);
console.log(text);
