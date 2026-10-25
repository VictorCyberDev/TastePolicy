// Operator tool: discover and inspect another compatible issuer, and (only on
// explicit confirmation) print the TASTEPOLICY_TRUSTED_ISSUERS entry for it.
//   npm run issuer:inspect -- https://issuer.example
//   npm run issuer:inspect -- https://issuer.example --confirm-kid <kid>
// Nothing is written anywhere. Without --confirm-kid the issuer stays UNKNOWN.
import { safeFetchText } from "@/lib/net/safe-fetch";
import { admitIssuer, inspectIssuer } from "@/lib/attest/federation";

const [origin, flag, kid] = process.argv.slice(2);
if (!origin) {
  console.error("usage: issuer:inspect <https-origin> [--confirm-kid <kid>]");
  process.exit(2);
}
const inspection = await inspectIssuer(origin, (u) =>
  safeFetchText(u, "application/json"),
);
const { jwks, ...shown } = inspection;
void jwks;
console.log(JSON.stringify(shown, null, 2));
if (flag === "--confirm-kid" && kid) {
  try {
    const admitted = admitIssuer(inspection, {
      issuer: origin,
      activeKid: kid,
    });
    console.log(
      "\nAdd to TASTEPOLICY_TRUSTED_ISSUERS (merge with existing entries):\n" +
        JSON.stringify({ [admitted.issuer]: admitted.entry }),
    );
  } catch (e) {
    console.error("NOT ADMITTED:", e instanceof Error ? e.message : e);
    process.exit(1);
  }
} else
  console.log(
    "\ntrust: UNKNOWN. Discovery does not grant trust. Re-run with --confirm-kid <active kid you verified out of band> to print a trust entry.",
  );
