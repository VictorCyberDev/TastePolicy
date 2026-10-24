// SYNTHETIC TEST DATA — independent subject identities, never live Qloo evidence.
import { readFile } from "node:fs/promises";
import { testDatabase } from "./state-database";
import { entities } from "./qloo-fixtures";
import { provider, NOW } from "./interactive-fixtures";
import type { QlooProvider } from "@/server/qloo/contracts";
export const proxyAnchors = entities
  .slice(0, 5)
  .map((e) => ({ ...e, id: e.id.replace(/^0/, "2"), name: `Proxy ${e.name}` }));
export const replacement = {
  ...proxyAnchors[0],
  id: proxyAnchors[0].id.replace(/^2/, "3"),
};
export function subjectProvider(proxyScore = 0.3, selfScore = 0.9) {
  const base = provider(),
    calls: { kind: string; ids: string[] }[] = [];
  const q: QlooProvider = {
    ...base.q,
    async entities(ids) {
      calls.push({ kind: "entities", ids: [...ids] });
      return {
        status: "available",
        data: ids.map((id) =>
          [...entities, ...proxyAnchors, replacement].find((e) => e.id === id)!,
        ),
      };
    },
    async infer(input) {
      calls.push({ kind: "infer", ids: [...input.signalIds] });
      return provider({
        score: input.signalIds.some((id) => id.startsWith("2"))
          ? proxyScore
          : selfScore,
      }).q.infer(input);
    },
  };
  return { q, calls };
}
export async function subjectsDatabase(dataDir?: string, migrate = true) {
  const d = await testDatabase(dataDir, migrate);
  if (migrate)
    for (const file of [
      "0002_interactive_authorization.sql",
      "0003_taste_trajectory.sql",
      "0004_taste_proxy_group.sql",
      // Group authorization applies each member's own policy (M7), so the
      // platform and policy tables are part of the schema it runs on.
      "0005_platformization.sql",
      "0006_policy_control_plane.sql",
    ])
      await d.db.exec(
        await readFile(
          new URL(`../migrations/${file}`, import.meta.url),
          "utf8",
        ),
      );
  return d;
}
export const createProxy = (idempotencyKey = "proxy") => ({
  idempotencyKey,
  displayLabel: "Alex",
  signalIds: proxyAnchors.map((e) => e.id),
  identityReviewed: true,
  permissionAttested: true,
  scopes: ["MODEL_MANAGEMENT", "TASTE_EVALUATION", "GROUP_EVALUATION"],
  expiresAt: new Date(Date.parse(NOW) + 3600_000).toISOString(),
});
