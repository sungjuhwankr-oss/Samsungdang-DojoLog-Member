import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Next config uses static export, trailing slash, and Pages subpath guard", async () => {
  const src = await read("next.config.ts");
  assert.match(src, /output:\s*"export"/);
  assert.match(src, /trailingSlash:\s*true/);
  assert.match(src, /GITHUB_PAGES/);
  assert.match(src, /Samsungdang-DojoLog-Member/);
});

test("import route reads session fragment without Phase 2 decoding", async () => {
  const src = await read("app/components/fragment-probe.tsx");
  assert.match(src, /URLSearchParams/);
  assert.match(src, /get\("session"\)/);
  assert.doesNotMatch(src, /JSON\.parse|TextDecoder|atob\(/);
});

test("service worker is repository-subpath safe", async () => {
  const src = await read("public/sw.js");
  assert.match(src, /self\.registration\.scope/);
  assert.match(src, /BUILD_ASSETS/);
  assert.doesNotMatch(src, /caches\.addAll\(\[\s*"\//);
});

test("Phase 1 does not contain IndexedDB or session payload parser", async () => {
  const files = [
    await read("app/page.tsx"),
    await read("app/import/page.tsx"),
    await read("app/components/fragment-probe.tsx")
  ].join("\n");
  assert.doesNotMatch(files, /indexedDB|IDBDatabase|samsungdang-dojolog-session|JSON\.parse/);
});


test("Pages workflow requires a lockfile and npm ci", async () => {
  const src = await read(".github/workflows/pages.yml");
  assert.match(src, /test -f package-lock\.json/);
  assert.match(src, /npm ci --no-audit --no-fund/);
  assert.doesNotMatch(src, /npm install --no-audit --no-fund/);
});
