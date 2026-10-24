import { request } from "node:https";
import { lookup as dnsLookup } from "node:dns";
import { BlockList, isIP } from "node:net";

// Fetch for issuer metadata and status lists. Verifier-side SSRF defence:
// HTTPS only, address validated at connection time (no DNS-rebinding gap),
// no redirects, size and time bounds.
export class SafeFetchError extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}
// Address policy as a BlockList over parsed addresses (never string patterns).
// IPv4-mapped IPv6 addresses are matched by the IPv4 rules (Node unwraps them);
// the other forms that embed IPv4 (compatible, NAT64, 6to4, Teredo) are blocked
// outright rather than unwrapped.
const blocked = new BlockList();
for (const [net, len] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 3],
] as const)
  blocked.addSubnet(net, len, "ipv4");
for (const [net, len] of [
  ["::", 96],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const)
  blocked.addSubnet(net, len, "ipv6");
export function privateAddress(addr: string): boolean {
  const v = isIP(addr);
  if (v === 0) return true;
  return blocked.check(addr, v === 4 ? "ipv4" : "ipv6");
}
// Connection-time resolver: validates every address that could be used.
export function guardedLookup(
  host: string,
  opts: { all?: boolean } | number | undefined,
  cb: (err: Error | null, address: unknown, family?: number) => void,
) {
  const all = typeof opts === "object" && opts?.all === true;
  dnsLookup(host, { all: true }, (err, addrs) => {
    const list =
      (addrs as unknown as { address: string; family: number }[]) ?? [];
    if (err || !list.length)
      return cb(err ?? new Error("NO_ADDRESS"), all ? [] : "", 4);
    if (list.some((a) => privateAddress(a.address)))
      return cb(new SafeFetchError("ADDRESS_NOT_ALLOWED"), all ? [] : "", 4);
    if (all) return cb(null, list);
    cb(null, list[0].address, list[0].family);
  });
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
    // Absolute deadline: a server trickling bytes cannot hold the slot.
    const total = setTimeout(() => {
      req.destroy();
      reject(new SafeFetchError("TIMEOUT"));
    }, timeout * 2);
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
        lookup: guardedLookup as never,
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
        res.on("end", () => {
          clearTimeout(total);
          resolve(Buffer.concat(chunks).toString("utf8"));
        });
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
    req.on("close", () => clearTimeout(total));
    req.end();
  });
}
