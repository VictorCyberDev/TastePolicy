// Locked-component inventory; no claim of artifact provenance or exploitability.
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
const licenseLedger = JSON.parse(
  await readFile("docs/company/dependency-ip-ledger.json", "utf8"),
);
const licenseByPath = new Map(
  licenseLedger.packages.map((p) => [p.path, p.license]),
);
const refs = new Map(
  Object.keys(lock.packages).map((p) => [p, p || "tastepolicy-root"]),
);
function resolveDependency(path, name) {
  let prefix = path;
  while (true) {
    const target = (prefix ? prefix + "/" : "") + "node_modules/" + name;
    if (refs.has(target)) return target;
    const at = prefix.lastIndexOf("/node_modules/");
    if (at >= 0) prefix = prefix.slice(0, at);
    else if (prefix) prefix = "";
    else return null;
  }
}
const components = Object.entries(lock.packages)
  .filter(([p]) => p)
  .map(([path, p]) => {
    const full = p.name || path.split("node_modules/").at(-1),
      slash = full.startsWith("@") ? full.indexOf("/") : -1;
    const group = slash >= 0 ? full.slice(0, slash) : undefined,
      name = slash >= 0 ? full.slice(slash + 1) : full;
    const license = licenseByPath.get(path) || p.license;
    return {
      type: "library",
      "bom-ref": path,
      name,
      ...(group ? { group } : {}),
      version: p.version,
      scope: p.dev ? "excluded" : "required",
      purl:
        "pkg:npm/" +
        (group ? encodeURIComponent(group) + "/" : "") +
        encodeURIComponent(name) +
        "@" +
        encodeURIComponent(p.version),
      ...(license ? { licenses: [{ license: { name: license } }] } : {}),
      properties: [
        { name: "tastepolicy:locked-path", value: path },
        { name: "tastepolicy:development", value: String(!!p.dev) },
        { name: "tastepolicy:optional", value: String(!!p.optional) },
        ...(p.integrity
          ? [{ name: "tastepolicy:lock-integrity", value: p.integrity }]
          : []),
      ],
    };
  });
const dependencies = Object.entries(lock.packages).map(([path, p]) => ({
  ref: refs.get(path),
  dependsOn: [
    ...new Set(
      Object.keys({ ...p.dependencies, ...p.optionalDependencies })
        .map((n) => resolveDependency(path, n))
        .filter(Boolean),
    ),
  ],
}));
const sbom = {
  $schema: "http://cyclonedx.org/schema/bom-1.5.schema.json",
  bomFormat: "CycloneDX",
  specVersion: "1.5",
  serialNumber: "urn:uuid:" + randomUUID(),
  version: 1,
  metadata: {
    timestamp: new Date().toISOString(),
    tools: [
      {
        vendor: "TastePolicy",
        name: "locked-component-inventory",
        version: "1",
      },
    ],
    component: {
      type: "application",
      "bom-ref": "tastepolicy-root",
      name: "tastepolicy",
      version: lock.version,
      licenses: [{ license: { id: "Apache-2.0" } }],
    },
    properties: [
      {
        name: "tastepolicy:scope",
        value:
          "All locked components including optional uninstalled binaries; dependencies and optional dependencies resolved by lock paths. Peer dependency edges omitted. No deployed artifact/provenance certification.",
      },
    ],
  },
  components,
  dependencies,
};
await writeFile(
  "docs/security/sbom.cdx.json",
  JSON.stringify(sbom, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    components: components.length,
    dependencyNodes: dependencies.length,
  }),
);
