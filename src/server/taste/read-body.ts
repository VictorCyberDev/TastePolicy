export const MAX_BODY_BYTES = 16384;
export const BODY_READ_TIMEOUT_MS = 3000;
export class BodyReadFailure extends Error {
  constructor(
    readonly code: "INVALID_INPUT" | "BODY_TOO_LARGE" | "BODY_READ_TIMEOUT",
  ) {
    super(code);
  }
}
export async function readJsonBody(
  request: Request,
  timeoutMs = BODY_READ_TIMEOUT_MS,
): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new BodyReadFailure("INVALID_INPUT");
  const expires = Date.now() + timeoutMs;
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const next = await Promise.race([
          reader.read(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(new BodyReadFailure("BODY_READ_TIMEOUT")),
              Math.max(0, expires - Date.now()),
            );
          }),
        ]);
        if (Date.now() > expires)
          throw new BodyReadFailure("BODY_READ_TIMEOUT");
        if (next.done) break;
        length += next.value.length;
        if (length > MAX_BODY_BYTES)
          throw new BodyReadFailure("BODY_TOO_LARGE");
        chunks.push(next.value);
      } finally {
        if (timer) clearTimeout(timer);
      }
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    try {
      return JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      );
    } catch {
      throw new BodyReadFailure("INVALID_INPUT");
    }
  } catch (error) {
    // Cancellation must not extend the deadline if a stream's cancel hook stalls.
    void reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}
