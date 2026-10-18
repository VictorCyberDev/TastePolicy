// Run server-side only, with privately configured environment variables.
import { TastePolicyClient } from "../src/sdk/index.ts";
const client = new TastePolicyClient(
  process.env.TASTEPOLICY_API_URL,
  process.env.TASTEPOLICY_API_KEY,
);
const passport = await client.passport({
  passportRef: process.env.TASTEPOLICY_PASSPORT_REF,
});
console.log({
  schemaVersion: passport.schemaVersion,
  stateVersion: passport.stateVersion,
});
// client.evaluate({passportRef, idempotencyKey, proposal}) returns a cultural-only continuation.
