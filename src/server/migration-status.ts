import manifest from "./migration-manifest.json";
export function migrationLedgerIsCurrent(
  rows: { version: string; checksum: string }[],
) {
  const actual = new Map(rows.map((r) => [r.version, r.checksum]));
  return Object.entries(manifest).every(
    ([version, checksum]) => actual.get(version) === checksum,
  );
}
