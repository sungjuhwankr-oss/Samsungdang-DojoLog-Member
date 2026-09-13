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

test("import route delegates fragment parsing without unsafe DOM insertion", async () => {
  const src = await read("app/components/fragment-probe.tsx");
  assert.match(src, /parseSessionHash/);
  assert.match(src, /useSyncExternalStore/);
  assert.doesNotMatch(src, /innerHTML|eval\(/);
});

test("service worker is repository-subpath safe", async () => {
  const src = await read("public/sw.js");
  assert.match(src, /self\.registration\.scope/);
  assert.match(src, /BUILD_ASSETS/);
  assert.doesNotMatch(src, /caches\.addAll\(\[\s*"\//);
});

test("Phase 2 import remains preview-only without browser storage", async () => {
  const files = [
    await read("app/page.tsx"),
    await read("app/import/page.tsx"),
    await read("app/components/fragment-probe.tsx"),
    await read("app/session-share.mjs")
  ].join("\n");
  assert.doesNotMatch(files, /indexedDB|IDBDatabase|localStorage|sessionStorage/);
});


test("Pages workflow requires a lockfile and npm ci", async () => {
  const src = await read(".github/workflows/pages.yml");
  assert.match(src, /test -f package-lock\.json/);
  assert.match(src, /npm ci --no-audit --no-fund/);
  assert.doesNotMatch(src, /npm install --no-audit --no-fund/);
});
