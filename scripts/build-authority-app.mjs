import { build } from "esbuild";
import { readFile, writeFile, mkdir } from "node:fs/promises";
const bundled = await build({
  entryPoints: ["src/features/mcp-app/authority-card.ts"],
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  target: "es2022",
  minify: true,
  legalComments: "inline",
});
const template = await readFile(
  "src/features/mcp-app/authority-card.html",
  "utf8",
);
const script = bundled.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
await mkdir("public/mcp", { recursive: true });
await writeFile(
  "public/mcp/authority-app.html",
  template.replace("<!--APP_SCRIPT-->", `<script>${script}</script>`),
);
console.log(
  "Authority Card bundled from pinned MCP Apps SDK; no external scripts.",
);
