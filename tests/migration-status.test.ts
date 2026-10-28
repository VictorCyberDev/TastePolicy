// @vitest-environment node
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { expect, it } from "vitest";
import manifest from "@/server/migration-manifest.json";
import { migrationLedgerIsCurrent } from "@/server/migration-status";
it("readiness verifies every migration checksum rather than an old sentinel table", () => {
  const rows = Object.entries(manifest).map(([version, checksum]) => ({
    version,
    checksum,
  }));
  expect(migrationLedgerIsCurrent(rows)).toBe(true);
  expect(migrationLedgerIsCurrent(rows.slice(0, 8))).toBe(false);
  expect(
    migrationLedgerIsCurrent(
      rows.map((r, i) => (i === 0 ? { ...r, checksum: "changed" } : r)),
    ),
  ).toBe(false);
  const files = readdirSync("migrations")
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .sort();
  expect(Object.keys(manifest)).toEqual(files);
  for (const [version, checksum] of Object.entries(manifest))
    expect(
      createHash("sha256")
        .update(readFileSync(`migrations/${version}`))
        .digest("hex"),
    ).toBe(checksum);
});
