import "server-only";
import { isQlooHost, type QlooHost } from "@/lib/config/qloo";
import type { ProviderResult } from "@/types/domain";
import { reasonForStatus } from "./errors";
export type QlooTransport = (
  path: "/search" | "/entities" | "/v2/insights",
  parameters: URLSearchParams,
) => Promise<ProviderResult<unknown>>;
export const QLOO_TIMEOUT_MS = 8000;
export const MAX_PROVIDER_BYTES = 1024 * 1024;
export function createQlooTransport(
  config: { apiKey?: string; host?: QlooHost },
  fetcher: typeof fetch = fetch,
  timeoutMs = QLOO_TIMEOUT_MS,
): QlooTransport {
  return async (path, parameters) => {
    if (!config.apiKey)
      return { status: "unavailable", reason: "not_configured" };
    if (!isQlooHost(config.host))
      return { status: "unavailable", reason: "host_not_configured" };
    if (!["/search", "/entities", "/v2/insights"].includes(path))
      return { status: "unavailable", reason: "provider_error" };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const url = new URL(path, config.host);
      url.search = parameters.toString();
      const response = await fetcher(url, {
        method: "GET",
        headers: { "X-Api-Key": config.apiKey, Accept: "application/json" },
        signal: controller.signal,
        redirect: "error",
        cache: "no-store",
      });
      if (!response.ok) {
        await response.body?.cancel();
        return {
          status: "unavailable",
          reason: reasonForStatus(response.status),
        };
      }
      if (!response.headers.get("content-type")?.includes("application/json")) {
        await response.body?.cancel();
        return { status: "unavailable", reason: "invalid_response" };
      }
      const reader = response.body?.getReader();
      if (!reader) return { status: "unavailable", reason: "invalid_response" };
      let length = 0;
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > MAX_PROVIDER_BYTES) {
          await reader.cancel();
          return { status: "unavailable", reason: "invalid_response" };
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      let payload: unknown;
      try {
        payload = JSON.parse(new TextDecoder().decode(bytes));
      } catch {
        return { status: "unavailable", reason: "invalid_response" };
      }
      return { status: "available", data: payload };
    } catch {
      return {
        status: "unavailable",
        reason: controller.signal.aborted ? "timeout" : "provider_error",
      };
    } finally {
      clearTimeout(timer);
    }
  };
}
