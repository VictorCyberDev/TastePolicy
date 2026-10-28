import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { relative, dirname, join } from "node:path";
const run = spawnSync(
  process.execPath,
  ["node_modules/typescript/bin/tsc", "-p", "tsconfig.sdk.json"],
  { stdio: "inherit" },
);
if (run.status !== 0) process.exit(run.status ?? 1);
async function rewrite(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await rewrite(path);
    else if (path.endsWith(".d.ts")) {
      let text = await readFile(path, "utf8");
      text = text
        .replace(/(["'])@\/([^"']+)\1/g, (_, q, target) => {
          let p = relative(
            dirname(path),
            join("packages/sdk/dist", target),
          ).replaceAll("\\", "/");
          return q + (p.startsWith(".") ? p : "./" + p) + ".js" + q;
        })
        .replace(
          /(from\s+["'])(\.\.?\/[^"']+?)(["'])/g,
          (_, a, p, b) => a + (/\.(js|json)$/.test(p) ? p : p + ".js") + b,
        );
      await writeFile(path, text);
    }
  }
}
await rewrite("packages/sdk/dist");
await build({
  entryPoints: ["src/sdk/index.ts", "src/sdk/sandbox.ts", "src/sdk/attest.ts"],
  outdir: "packages/sdk/dist/sdk",
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  packages: "external",
  tsconfig: "tsconfig.json",
});
console.log("SDK ESM and declarations built. Publication is a separate gate.");
