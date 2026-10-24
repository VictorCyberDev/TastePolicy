import { request } from "node:https";
import { lookup as dnsLookup } from "node:dns";
import { isIP } from "node:net";

// Fetch for issuer metadata and status lists. Verifier-side SSRF defence:
// HTTPS only, address validated at connection time (no DNS-rebinding gap),
// no redirects, size and time bounds.
export class SafeFetchError extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}
function privateV4(a: string) {
  const [x, y] = a.split(".").map(Number);
  return (
    x === 0 ||
    x === 10 ||
    x === 127 ||
    (x === 100 && y >= 64 && y <= 127) ||
    (x === 169 && y === 254) ||
    (x === 172 && y >= 16 && y <= 31) ||
    (x === 192 && y === 168) ||
    (x === 192 && y === 0) ||
    (x === 198 && (y === 18 || y === 19)) ||
    x >= 224
  );
}
export function privateAddress(addr: string): boolean {
  const v = isIP(addr);
  if (v === 4) return privateV4(addr);
  if (v !== 6) return true;
  const a = addr.toLowerCase();
  if (a === "::" || a === "::1") return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(a);
  if (mapped) return privateV4(mapped[1]);
  return /^(fc|fd|fe[89ab])/.test(a) || a.startsWith("ff");
}
export interface SafeFetchOptions {
  maxBytes?: number;
  timeoutMs?: number;
}
export async function safeFetchText(
  url: string,
  accept: string,
  o: SafeFetchOptions = {},
): Promise<string> {
  const max = o.maxBytes ?? 65536,
    timeout = o.timeoutMs ?? 3000;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new SafeFetchError("URL_INVALID");
  }
  if (u.protocol !== "https:" || u.username || u.password || u.hash)
    throw new SafeFetchError("URL_NOT_ALLOWED");
  if (
    isIP(u.hostname.replace(/^\[|\]$/g, "")) &&
    privateAddress(u.hostname.replace(/^\[|\]$/g, ""))
  )
    throw new SafeFetchError("ADDRESS_NOT_ALLOWED");
  return new Promise<string>((resolve, reject) => {
    const req = request(
      {
        protocol: "https:",
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method: "GET",
        headers: { accept },
        timeout,
        // Validate the address actually used for the connection.
        lookup: (host, opts, cb) => {
          dnsLookup(host, { ...opts, all: true }, (err, addrs) => {
            const list =
              (addrs as unknown as { address: string; family: number }[]) ?? [];
            if (err || !list.length)
              return cb(err ?? new Error("NO_ADDRESS"), "", 4);
            if (list.some((a) => privateAddress(a.address)))
              return cb(new SafeFetchError("ADDRESS_NOT_ALLOWED"), "", 4);
            cb(null, list[0].address, list[0].family);
          });
        },
      },
      (res) => {
        if ((res.statusCode ?? 0) !== 200) {
          res.resume();
          return reject(new SafeFetchError(`HTTP_${res.statusCode}`));
        }
        let size = 0;
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > max) {
            req.destroy();
            reject(new SafeFetchError("TOO_LARGE"));
          } else chunks.push(c);
        });
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        res.on("error", () => reject(new SafeFetchError("FETCH_FAILED")));
      },
    );
    req.on("timeout", () => {
      req.destroy();
      reject(new SafeFetchError("TIMEOUT"));
    });
    req.on("error", (e) =>
      reject(
        e instanceof SafeFetchError ? e : new SafeFetchError("FETCH_FAILED"),
      ),
    );
    req.end();
  });
}
