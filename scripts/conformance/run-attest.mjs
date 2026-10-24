// Usage: npm run conformance:attest -- [path/to/verifier-adapter.(m)js|ts] [--strict-reasons]
// The adapter's default export receives {presentation, audience, now, nonce?,
// trustedIssuers, statusLists, seenJtis} and returns {valid, reason?}.
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const args = process.argv.slice(2),
  strict = args.includes("--strict-reasons"),
  adapterPath = args.find((a) => !a.startsWith("--"));
const adapter = await import(
  adapterPath
    ? pathToFileURL(resolve(adapterPath)).href
    : new URL("./reference-adapter.ts", import.meta.url).href
);
const file = JSON.parse(
  await readFile(
    new URL("../../conformance/attestation-vectors-v1.json", import.meta.url),
    "utf8",
  ),
);
let failed = 0;
for (const v of file.vectors) {
  const o = v.options ?? {};
  let out;
  try {
    out = await adapter.default({
      presentation: v.presentation,
      audience: o.audience ?? file.context.audience,
      now: o.now ?? file.context.now + 10,
      nonce: o.nonce,
      trustedIssuers: {
        [file.context.issuer]: {
          jwks: file.context.jwks,
          vct: o.acceptedVct ?? [file.context.vct],
        },
      },
      statusLists: file.statusLists,
      seenJtis: o.seenJtis ?? [],
    });
  } catch (e) {
    out = {
      valid: false,
      reason: "THROWN:" + (e instanceof Error ? e.message : "error"),
    };
  }
  const okValid = out.valid === v.expect.valid,
    okReason = !strict || v.expect.valid || out.reason === v.expect.reason;
  if (!okValid || !okReason) failed++;
  console.log(
    `${okValid && okReason ? "PASS" : "FAIL"}  ${v.id}  ${v.description}${okValid && okReason ? "" : `  (got valid=${out.valid} reason=${out.reason}; want valid=${v.expect.valid}${strict ? ` reason=${v.expect.reason}` : ""})`}`,
  );
}
console.log(
  `\n${file.vectors.length - failed}/${file.vectors.length} vectors passed (${file.version}${strict ? ", strict reasons" : ""})`,
);
process.exit(failed ? 1 : 0);
