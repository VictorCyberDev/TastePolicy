export default function Page() {
  return (
    <main>
      <p>TASTEPOLICY · DEVELOPER EXAMPLE</p>
      <h1>Your taste. Your rules. Any agent.</h1>
      <p>
        This example keeps TastePolicy credentials in the server environment.
        The authenticated server-to-server passport route is{" "}
        <code>/api/passport</code>.
      </p>
      <p>
        Run <code>npm run offline</code> for deterministic ALLOW, ASK, REJECT
        and UNAVAILABLE demonstrations without a model key, Qloo call or charge.
      </p>
      <p>
        To integrate a model, bind the reviewed choice on your server, use the
        authority tool, collect the configured tool approval and honor the
        returned boundary. Verification is not authorization.
      </p>
      <a href="https://tastepolicy.vercel.app/developers">
        Production developer onboarding
      </a>
    </main>
  );
}
