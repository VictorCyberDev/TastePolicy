# TastePolicy SDK

Subjective authority for AI agents. Server-side only; never expose a developer credential in a browser bundle.

## Release state

Version 0.2.0 is built and packable from this repository. **Not yet published to npm.** The proposed scope does not prove npm ownership. Until registry publication is verified, build from the repository and install the resulting tarball:

```sh
npm ci
npm run sdk:build
npm pack ./packages/sdk --ignore-scripts
# In your server application, install the exact generated tarball path.
npm install /path/to/victorcyberdev-tastepolicy-sdk-0.2.0.tgz
```

## First request

Sign up at https://tastepolicy.vercel.app/signup, review five public cultural identities, enroll a Passport, and issue a scoped developer credential. Keep it in a server secret.

```ts
import {
  TastePolicyClient,
  TastePolicyError,
} from "@victorcyberdev/tastepolicy-sdk";
const client = new TastePolicyClient(
  "https://tastepolicy.vercel.app",
  process.env.TASTEPOLICY_API_KEY!,
);
const passport = await client.passport({ passportRef });
const result = await client.evaluate({
  passportRef,
  idempotencyKey: crypto.randomUUID(),
  requestedAction: "SHORTLIST",
  proposal: {
    agentId: "my-agent",
    expectedStateVersion: passport.stateVersion,
    candidate: reviewedQlooEntity,
    context: { key: "weekend", domain: "place" },
  },
});
switch (result.decision) {
  case "ALLOW":
    /* continue only within permittedActions */ break;
  case "ASK":
    /* ask for the typed confirmation or missing facts */ break;
  case "REJECT":
    /* stop this choice */ break;
  case "UNAVAILABLE":
    /* pause; do not infer dislike */ break;
}
```

The client returns typed stable errors, honors timeouts, refuses redirects and accepts an explicit fetch implementation for testing. Use a new idempotency key for a new decision, and preserve it for an identical retry.

## Modules

- Main entry: REST client, typed errors, Passport/decision/lease types.
- `/sandbox`: deterministic synthetic four-outcome fetch adapter; no Qloo, no real authority.
- `/attest`: portable-proof verifier with explicit issuer trust and safe status retrieval. Verification is not authorization.

See the source API and https://tastepolicy.vercel.app/docs for lifecycle examples. No payment, booking, messaging, legal or account authority is ever granted by this client.

## License

Apache-2.0 for TastePolicy code. Qloo data/marks and other vendors' services are not licensed by this package. See LICENSE and the repository dependency/IP ledger.
