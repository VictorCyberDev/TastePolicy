import { deflateSync, inflateSync } from "node:zlib";
import { base64url } from "jose";

// Token Status List (draft-ietf-oauth-status-list-21): a packed array of
// `bits`-wide statuses, entry 0 in the least significant bits of byte 0,
// compressed with DEFLATE in the ZLIB format.
export const STATUS = { VALID: 0, INVALID: 1, SUSPENDED: 2 } as const;
export type StatusName = keyof typeof STATUS;
export const STATUS_NAMES = ["VALID", "INVALID", "SUSPENDED"] as const;
export const LIST_SIZE = 131072;
export const MAX_LIST_BYTES = 1 << 20;

export function emptyList(size = LIST_SIZE, bits = 2): Uint8Array {
  if (![1, 2, 4, 8].includes(bits) || size <= 0) throw Error("bad list");
  return new Uint8Array(Math.ceil((size * bits) / 8));
}
const inRange = (list: Uint8Array, idx: number, bits: number) =>
  Number.isSafeInteger(idx) &&
  idx >= 0 &&
  idx < Math.floor((list.length * 8) / bits);
export function getStatus(list: Uint8Array, idx: number, bits: number) {
  if (!inRange(list, idx, bits)) return null;
  const bit = idx * bits; // safe integers only: no 32-bit bitwise coercion
  return (list[Math.floor(bit / 8)] >> (bit % 8)) & ((1 << bits) - 1);
}
export function setStatus(
  list: Uint8Array,
  idx: number,
  bits: number,
  value: number,
) {
  if (!inRange(list, idx, bits)) throw Error("index out of range");
  if (value < 0 || value >= 1 << bits) throw Error("status does not fit");
  const bit = idx * bits,
    byte = Math.floor(bit / 8),
    shift = bit % 8,
    mask = ((1 << bits) - 1) << shift;
  list[byte] = (list[byte] & ~mask) | (value << shift);
}
export const encodeList = (list: Uint8Array) =>
  base64url.encode(deflateSync(list));
export function decodeList(lst: string): Uint8Array {
  // Bounded inflate: a hostile list must not expand without limit.
  const out = inflateSync(base64url.decode(lst), {
    maxOutputLength: MAX_LIST_BYTES,
  });
  return new Uint8Array(out);
}
