import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Keep this order aligned with frontend/index.html. The modules intentionally
// use browser globals so the generated site remains dependency-free.
const moduleOrder = [
  "examples.js",
  "model.js",
  "renderer-contract.js",
  "renderers/symbols.js",
  "projections/multi-wire.js",
  "layout/deterministic.js",
  "renderers/geospatial.js",
  "renderers/single-wire.js",
  "app.js"
];

export async function buildStatic({ rootDir = projectRoot, outDir = join(rootDir, "dist") } = {}) {
  const sourceRoot = join(rootDir, "frontend");
  const assetsDir = join(outDir, "assets");
  await mkdir(assetsDir, { recursive: true });

  const sources = await Promise.all(moduleOrder.map(async (relative) => {
    const source = await readFile(join(sourceRoot, relative), "utf8");
    return `/* ${relative} */\n${source.trim()}\n`;
  }));
  await writeFile(join(assetsDir, "bmopf-explorer.js"), `${sources.join("\n")}\n`, "utf8");
  await cp(join(sourceRoot, "styles.css"), join(assetsDir, "styles.css"));
  await cp(join(sourceRoot, "vendor"), join(outDir, "vendor"), { recursive: true });

  let index = await readFile(join(sourceRoot, "index.html"), "utf8");
  const stylesheetTag = '<link rel="stylesheet" href="styles.css">';
  if (!index.includes(stylesheetTag)) throw new Error("frontend/index.html is missing its stylesheet link");
  index = index.replace(stylesheetTag, '<link rel="stylesheet" href="assets/styles.css">');
  for (const relative of moduleOrder) {
    const scriptTag = `<script src="${relative}"></script>`;
    if (!index.includes(scriptTag)) throw new Error(`frontend/index.html is missing ${scriptTag}`);
    index = index.replace(scriptTag, "");
  }
  index = index.replace("</body>", '  <script src="assets/bmopf-explorer.js"></script>\n</body>');
  await writeFile(join(outDir, "index.html"), index, "utf8");

  const manifest = {
    format: "distribution-network-plots-static-v1",
    entry: "index.html",
    javascript: "assets/bmopf-explorer.js",
    stylesheet: "assets/styles.css",
    moduleOrder,
    offlineVendor: ["vendor/elk.bundled.js"]
  };
  await writeFile(join(outDir, "build-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { outDir, manifest };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outArg = process.argv[2] ? resolve(process.argv[2]) : join(projectRoot, "dist");
  const result = await buildStatic({ outDir: outArg });
  console.log(`Built static explorer in ${result.outDir}`);
}
