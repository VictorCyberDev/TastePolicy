// Fixed local source imports for Node 24 native TS transformation. No caller-controlled modules.
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = new URL("../src/", import.meta.url);
const localRoots = [
  root,
  new URL("../scripts/", import.meta.url),
  new URL("../tests/", import.meta.url),
];
registerHooks({
  resolve(specifier, context, nextResolve) {
    let url;
    if (specifier.startsWith("@/")) url = new URL(specifier.slice(2), root);
    else if (
      specifier.startsWith(".") &&
      localRoots.some((root) => context.parentURL?.startsWith(root.href))
    )
      url = new URL(specifier, context.parentURL);
    if (
      url &&
      localRoots.some((root) => url.href.startsWith(root.href)) &&
      !/\.[a-z]+$/i.test(url.pathname)
    ) {
      const path = fileURLToPath(url) + ".ts";
      if (existsSync(path))
        return nextResolve(pathToFileURL(path).href, context);
    }
    return nextResolve(specifier, context);
  },
});
