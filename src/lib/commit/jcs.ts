// RFC 8785 JSON Canonicalization Scheme (JCS) for the JSON this product
// commits to. Object members are sorted by UTF-16 code units, no whitespace,
// strings and numbers are serialized as ECMAScript's JSON.stringify does (which
// RFC 8785 adopts for I-JSON numbers).
//
// The input must be I-JSON (RFC 7493). Anything that is not is refused with a
// TypeError whose message is the stable code NOT_I_JSON, never repaired,
// dropped or guessed: undefined (as a member or element), NaN, +/-Infinity,
// bigint, functions, symbols, sparse arrays, strings (or member names)
// containing a lone surrogate, non-plain objects (Date, Map, class instances,
// objects with symbol keys), and cycles. Two different inputs therefore can
// never canonicalize to the same string because something was silently
// discarded. Duplicate member names cannot occur in a JavaScript object.
export const NOT_I_JSON = "NOT_I_JSON";
const MAX_DEPTH = 64;
const refuse = (): never => {
  throw new TypeError(NOT_I_JSON);
};
// A string is I-JSON only if it is well-formed UTF-16 (no unpaired surrogate).
export function isWellFormed(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const d = s.charCodeAt(i + 1);
      if (!(d >= 0xdc00 && d <= 0xdfff)) return false;
      i++;
    } else if (c >= 0xdc00 && c <= 0xdfff) return false;
  }
  return true;
}
const str = (s: string) => (isWellFormed(s) ? JSON.stringify(s) : refuse());
function walk(value: unknown, depth: number): string {
  if (depth > MAX_DEPTH) return refuse();
  if (value === null) return "null";
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) return refuse();
      return Object.is(value, -0) ? "0" : JSON.stringify(value);
    case "string":
      return str(value);
    case "object": {
      if (Array.isArray(value)) {
        const out: string[] = [];
        for (let i = 0; i < value.length; i++) {
          if (!(i in value)) return refuse(); // sparse array
          out.push(walk(value[i], depth + 1));
        }
        return "[" + out.join(",") + "]";
      }
      const proto = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && proto !== null) return refuse();
      if (Object.getOwnPropertySymbols(value).length) return refuse();
      const o = value as Record<string, unknown>;
      return (
        "{" +
        Object.keys(o)
          .sort()
          .map((k) => str(k) + ":" + walk(o[k], depth + 1))
          .join(",") +
        "}"
      );
    }
    default:
      return refuse(); // undefined, bigint, function, symbol
  }
}
export function canonicalize(value: unknown): string {
  return walk(value, 0);
}
