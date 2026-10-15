import { createHash } from "node:crypto";
import { canonical } from "@/lib/state/canonical";
export function hash(value: unknown) {
  return createHash("sha256").update(canonical(value)).digest("hex");
}
