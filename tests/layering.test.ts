// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { expect, it } from "vitest";

// Milestone layers. A file may import only files of its own layer or below, so
// each milestone stays valid on its own branch and cannot quietly depend on a
// later one. Composition roots wire every installed layer together and are the
// only files allowed to look upward; they must still resolve on this branch.
//   6 platform/OAuth   7 policy   8 leases   9 attestation/network
const root = resolve(__dirname, "..");
const SRC = join(root, "src");
const rel = (f: string) => relative(root, f).split("\\").join("/");
const layerOf = (f: string): number => {
  const p = rel(f);
  if (
    /^src\/lib\/attest\//.test(p) ||
    /^src\/lib\/timeline\//.test(p) ||
    /^src\/app\/account\/timeline\//.test(p) ||
    p === "src/features/policy/AuthorityTimeline.tsx" ||
    /^src\/server\/platform\/(attest-|public-limit)/.test(p) ||
    /^src\/sdk\/attest/.test(p) ||
    /^src\/app\/(api\/attest|verify|api\/ready)\//.test(p) ||
    /^src\/app\/\.well-known\/(jwks\.json|jwt-vc-issuer|tastepolicy-issuer)\//.test(
      p,
    ) ||
    p === "src/features/policy/VerifyProof.tsx"
  )
    return 9;
  if (
    /^src\/lib\/lease\//.test(p) ||
    /^src\/server\/platform\/lease-/.test(p) ||
    /^src\/app\/account\/leases\//.test(p) ||
    p === "src/features/policy/LeaseControl.tsx"
  )
    return 8;
  if (
    /^src\/lib\/policy\//.test(p) ||
    p === "src/server/subjects/member-policy.ts" ||
    /^src\/server\/platform\/policy-/.test(p) ||
    /^src\/features\/policy\//.test(p) ||
    /^src\/app\/account\/(rules|inspector)\//.test(p)
  )
    return 7;
  return 6;
};
const COMPOSITION = new Set([
  "src/app/product/page.tsx",
  "src/app/developers/page.tsx",
  "src/server/platform/http.ts",
  "src/app/api/workspace/[operation]/route.ts",
  "src/server/platform/gateway.ts",
  "src/server/platform/mcp.ts",
  "src/server/platform/a2a.ts",
  "src/server/platform/service.ts",
  "src/server/subjects/group-service.ts",
  "src/server/subjects/postgres.ts",
  "src/server/state/postgres.ts",
  // M24: the anonymous demo state route runs the policy engine against a
  // session-chosen action ceiling.
  "src/server/state/service.ts",
  // M24: the human product composes the action ladder (M7) and account API.
  "src/components/brand/primitives.tsx",
  "src/features/experience/AssistedChoice.tsx",
  "src/features/experience/personas.ts",
  "src/features/experience/useAssistedChoice.ts",
  "src/features/home/PersonalAgencyHome.tsx",
  "src/lib/human/copy.ts",
  "src/server/state/session-authority.ts",
  "src/server/state/repositories.ts",
  "src/lib/platform/contracts.ts",
  "src/lib/platform/openapi.ts",
  "src/lib/platform/errors.ts",
  "src/lib/platform/types.ts",
  "src/sdk/index.ts",
  "src/sdk/sandbox.ts",
  "src/sdk/types.ts",
  "src/features/policy/Product.tsx",
  "src/features/policy/Developers.tsx",
  "src/app/page.tsx",
]);
function walk(dir: string, out: string[] = []) {
  for (const e of readdirSync(dir)) {
    const f = join(dir, e);
    if (statSync(f).isDirectory()) walk(f, out);
    else if (/\.(ts|tsx|css)$/.test(f)) out.push(f);
  }
  return out;
}
function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith("@/")
    ? join(SRC, spec.slice(2))
    : spec.startsWith(".")
      ? resolve(dirname(from), spec)
      : null;
  if (!base) return null;
  for (const c of [
    base,
    base + ".ts",
    base + ".tsx",
    base + ".css",
    join(base, "index.ts"),
  ])
    try {
      if (statSync(c).isFile()) return c;
    } catch {}
  return null;
}
it("no file imports a file of a later milestone layer, and every import resolves", () => {
  const bad: string[] = [];
  for (const f of walk(SRC)) {
    if (COMPOSITION.has(rel(f))) continue;
    const mine = layerOf(f);
    const text = readFileSync(f, "utf8");
    for (const m of text.matchAll(
      /(?:from\s+|import\s+|import\()\s*["']([^"']+)["']/g,
    )) {
      const spec = m[1];
      if (!spec.startsWith("@/") && !spec.startsWith(".")) continue;
      const target = resolveImport(f, spec);
      if (!target) {
        bad.push(`${rel(f)} → ${spec} (does not resolve)`);
        continue;
      }
      if (layerOf(target) > mine)
        bad.push(`${rel(f)} (M${mine}) → ${rel(target)} (M${layerOf(target)})`);
    }
  }
  expect(bad).toEqual([]);
});
