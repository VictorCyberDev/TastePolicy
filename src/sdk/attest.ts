// Third-party verification kit. Everything a relying party needs to check a
// TastePolicy attestation without a TastePolicy credential. Server-side only.
export {
  verifyPresentation,
  ATTESTATION_TYP,
  STATUS_TYP,
  type VerifierConfig,
  type VerifyResult,
  type TrustedIssuer,
  type Reason,
} from "../lib/attest/verify";
export { present, parseCompact, type Signer } from "../lib/attest/sdjwt";
export { safeFetchText, SafeFetchError } from "../lib/attest/safe-fetch";
export { VCT } from "../lib/attest/issue";
import { safeFetchText } from "../lib/attest/safe-fetch";

// A status fetcher with the verifier-side SSRF defences. Pass it as `fetchStatus`.
export const fetchStatusList = (uri: string) =>
  safeFetchText(uri, "application/statuslist+jwt");
