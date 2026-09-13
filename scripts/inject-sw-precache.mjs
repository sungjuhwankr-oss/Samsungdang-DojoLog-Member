import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const outDir = path.resolve("out");
const swPath = path.join(outDir, "sw.js");
const marker = "/*__BUILD_ASSETS__*/ []";

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else files.push(full);
  }
  return files;
}

const allFiles = await walk(path.join(outDir, "_next", "static"));
const assets = allFiles
  .filter((file) => /\.(?:js|css)$/.test(file))
  .map((file) => `./${path.relative(outDir, file).split(path.sep).join("/")}`)
  .sort();

if (assets.length === 0) throw new Error("No Next.js JS/CSS build assets found for service-worker precache");

const source = await readFile(swPath, "utf8");
if (!source.includes(marker)) throw new Error("Service-worker precache marker not found");
await writeFile(swPath, source.replace(marker, JSON.stringify(assets, null, 2)));
console.log(`Injected ${assets.length} Next.js build assets into out/sw.js`);
