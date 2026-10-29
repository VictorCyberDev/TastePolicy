import { BodyReadFailure } from "@/server/taste/read-body";
export async function billingWebhookBody(
  request: Request,
  timeoutMs = 3000,
  maxBytes = 131072,
) {
  const reader = request.body?.getReader();
  if (!reader) throw new BodyReadFailure("INVALID_INPUT");
  const deadline = Date.now() + timeoutMs,
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const next = await Promise.race([
          reader.read(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(new BodyReadFailure("BODY_READ_TIMEOUT")),
              Math.max(0, deadline - Date.now()),
            );
          }),
        ]);
        if (Date.now() > deadline)
          throw new BodyReadFailure("BODY_READ_TIMEOUT");
        if (next.done) break;
        size += next.value.byteLength;
        if (size > maxBytes) throw new BodyReadFailure("BODY_TOO_LARGE");
        chunks.push(next.value);
      } finally {
        if (timer) clearTimeout(timer);
      }
    }
    return Buffer.concat(chunks, size);
  } catch (e) {
    void reader.cancel().catch(() => {});
    throw e;
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* pending read cancellation must not replace the bounded error */
    }
  }
}
