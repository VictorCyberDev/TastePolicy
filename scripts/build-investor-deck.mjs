// Reproducible editable investor material. Requires the supplied artifact runtime.
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
const workspaceDir = process.cwd();
const runtimeModules = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
const python = process.env.CODEX_PRIMARY_RUNTIME_PYTHON;
if (!runtimeModules || !python)
  throw Error("Supplied artifact runtime is required");
const { Presentation, PresentationFile } = await import(
  pathToFileURL(
    path.join(runtimeModules, "@oai/artifact-tool/dist/artifact_tool.mjs"),
  ).href
);
const { finalizePresentation } =
  await import("/root/.codex/skills/builtins/presentations/container_tools/artifact_tool_utils.mjs");
const build = path.join(workspaceDir, ".work-evidence/investor-build");
const output = path.join(
  workspaceDir,
  "docs/fundraising/tastepolicy-investor-v5.pptx",
);
const source = JSON.parse(
  await fs.readFile("docs/fundraising/deck-source.json", "utf8"),
);
await fs.mkdir(build, { recursive: true });
const presentation = Presentation.create({
  slideSize: { width: 1280, height: 720 },
});
function text(slide, value, x, y, w, h, size, color, bold = false) {
  const shape = slide.shapes.add({
    geometry: "textbox",
    position: { left: x, top: y, width: w, height: h },
    fill: "none",
    line: { style: "solid", fill: "none", width: 0 },
  });
  shape.text = value;
  shape.text.style = {
    fontSize: size,
    typeface: "DejaVu Sans",
    color,
    bold,
    insets: 0,
    autoFit: "none",
    verticalAlignment: "top",
    wrap: "square",
  };
  return shape;
}
for (const [i, row] of source.slides.entries()) {
  const slide = presentation.slides.add();
  const dark = i === 0 || i === 11;
  const ink = dark ? "#F6F3EC" : "#202924";
  slide.background.fill = dark ? "#202924" : "#F6F3EC";
  text(slide, row.title, 76, 64, 1128, 104, i === 0 ? 72 : 44, ink, true);
  if (i === 4) {
    text(
      slide,
      "A reviewed candidate gets a decision, receipt and bounded continuation.",
      76,
      210,
      520,
      270,
      34,
      ink,
    );
    slide.images.add({
      blob: new Uint8Array(
        await fs.readFile(
          path.join(
            workspaceDir,
            "docs/fundraising/assets/authority-example.png",
          ),
        ),
      ),
      contentType: "image/png",
      alt: "Illustrative website Authority Card. No live decision or lease.",
      fit: "contain",
      position: { left: 680, top: 175, width: 500, height: 450 },
    });
    text(
      slide,
      "Illustrative website card. No live decision.",
      680,
      635,
      500,
      45,
      19,
      "#53665A",
    );
  } else
    text(
      slide,
      row.body,
      76,
      i === 0 ? 236 : 210,
      1128,
      286,
      i === 0 ? 44 : 38,
      ink,
    );
  text(
    slide,
    row.caption,
    76,
    556,
    i === 4 ? 520 : 1128,
    104,
    24,
    dark ? "#B9CEBE" : "#385846",
  );
  slide.speakerNotes.text = row.notes;
  const png = await presentation.export({ slide, format: "png", scale: 1 });
  await fs.writeFile(
    path.join(build, `slide-${String(i + 1).padStart(2, "0")}.png`),
    new Uint8Array(await png.arrayBuffer()),
  );
}
const candidatePath = path.join(build, "candidate.pptx");
await (await PresentationFile.exportPptx(presentation)).save(candidatePath);
const result = await finalizePresentation({
  workspaceDir,
  candidatePath,
  finalPath: output,
  pythonExecutable: python,
  integrityValidatorPath:
    "/root/.codex/skills/builtins/presentations/container_tools/inspect_presentation_package_integrity.py",
  layoutValidatorPath:
    "/root/.codex/skills/builtins/presentations/container_tools/inspect_presentation_layout_geometry.py",
  layoutArgs: [
    "--expected-slide-size-emu",
    "12192000,6858000",
    "--validate-bullet-geometry",
    "--validate-heading-fit",
  ],
  explicitTotalSlideCount: source.slides.length,
  requiredNativeTableOwnerSlides: [],
  requiredNativeChartOwnerSlides: [],
  fontPolicy: { basis: "design", families: ["DejaVu Sans"] },
  verifyArtifactToolImport: true,
  receiptPath: path.join(build, "validation-v5.json"),
});
console.log(
  JSON.stringify(
    { output, slides: source.slides.length, validation: result },
    null,
    2,
  ),
);
