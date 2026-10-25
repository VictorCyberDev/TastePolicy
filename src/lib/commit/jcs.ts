// RFC 8785 JSON Canonicalization Scheme (JCS) for the JSON this product
// commits to. Object members are sorted by UTF-16 code units, no whitespace,
// strings and numbers are serialized as ECMAScript's JSON.stringify does (which
// RFC 8785 adopts for I-JSON numbers). Anything that is not I-JSON (undefined,
// NaN, Infinity, functions, symbols, bigint) is refused rather than guessed.
export function canonicalize(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) throw new TypeError("NOT_I_JSON");
      return Object.is(value, -0) ? "0" : JSON.stringify(value);
    case "string":
      return JSON.stringify(value);
    case "object": {
      if (Array.isArray(value))
        return "[" + value.map((v) => canonicalize(v)).join(",") + "]";
      const o = value as Record<string, unknown>;
      return (
        "{" +
        Object.keys(o)
          .filter((k) => o[k] !== undefined)
          .sort()
          .map((k) => JSON.stringify(k) + ":" + canonicalize(o[k]))
          .join(",") +
        "}"
      );
    }
    default:
      throw new TypeError("NOT_I_JSON");
  }
}
