import "server-only";
// Allowlisted fields only: never log arbitrary request bodies, headers, errors or environment values.
export function logEvent(
  event: "request_failed" | "request_completed",
  requestId: string,
) {
  console.info(JSON.stringify({ event, requestId }));
}
