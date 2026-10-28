// The publishing portal supplies this value. Never fabricate verification.
export const dynamic = "force-dynamic";
export function GET() {
  const token = process.env.OPENAI_APPS_CHALLENGE;
  const valid = token && token.length <= 4096 && /^[\x20-\x7e]+$/.test(token);
  return new Response(valid ? token : "Not configured", {
    status: valid ? 200 : 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
