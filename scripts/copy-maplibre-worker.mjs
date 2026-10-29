// MapLibre's worker is a separate ES module. Bundlers rewrite its URL in ways
// that break under the production build, so the pinned file from node_modules
// is served as a plain static asset and registered with setWorkerUrl().
import { copyFileSync, mkdirSync } from "node:fs";
mkdirSync("public/vendor", { recursive: true });
copyFileSync(
  "node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs",
  "public/vendor/maplibre-gl-worker.mjs",
);
console.log("MapLibre worker copied to public/vendor/maplibre-gl-worker.mjs");
