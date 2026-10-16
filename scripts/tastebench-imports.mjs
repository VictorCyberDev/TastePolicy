// Benchmark process only; the accepted runtime/source loader is unchanged.
import "./source-imports.mjs";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = new URL("../benchmarks/", import.meta.url);
registerHooks({
  resolve(specifier, context, next) {
    if (
      specifier.startsWith(".") &&
      (context.parentURL?.startsWith(root.href) ||
        context.parentURL?.startsWith(new URL("./", import.meta.url).href))
    ) {
      const url = new URL(specifier, context.parentURL),
        path = fileURLToPath(url) + ".ts";
      if (url.href.startsWith(root.href) && existsSync(path))
        return next(pathToFileURL(path).href, context);
    }
    return next(specifier, context);
  },
});
