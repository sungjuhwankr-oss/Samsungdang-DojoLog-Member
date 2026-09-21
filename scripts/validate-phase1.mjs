import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const mustExist = [
  "app/page.tsx",
  "app/import/page.tsx",
  "app/membership/page.tsx",
  "app/poc/membership-credential-v1/page.tsx",
  "app/components/pwa-bootstrap.tsx",
  "app/session-share.mjs",
  "app/manifest.ts",
  "public/sw.js",
  "scripts/inject-sw-precache.mjs",
  "public/icons/icon-192.png",
  "public/icons/icon-512.png",
  "public/icons/icon-maskable-512.png",
  "public/icons/apple-touch-icon.png",
  ".github/workflows/pages.yml",
  "next.config.ts"
];

for (const rel of mustExist) {
  await access(path.join(root, rel));
}

const nextConfig = await readFile(path.join(root, "next.config.ts"), "utf8");
for (const required of ['output: "export"', "trailingSlash: true", "Samsungdang-DojoLog-Member", "GITHUB_PAGES"]) {
  if (!nextConfig.includes(required)) throw new Error(`next.config.ts missing ${required}`);
}

const importPage = await readFile(path.join(root, "app/import/page.tsx"), "utf8");
if (!importPage.includes("FragmentProbe")) throw new Error("import page must include FragmentProbe");

const probe = await readFile(path.join(root, "app/components/fragment-probe.tsx"), "utf8");
if (!probe.includes("parseSessionHash") || !probe.includes("../session-share.mjs")) {
  throw new Error("fragment probe must delegate to the Phase 2 session-share parser");
}
if (/atob\(|TextDecoder|JSON\.parse/.test(probe)) {
  throw new Error("fragment probe must delegate payload decoding to session-share");
}

const pwaBootstrap = await readFile(path.join(root, "app/components/pwa-bootstrap.tsx"), "utf8");
for (const required of [
  "beforeinstallprompt",
  "appinstalled",
  "navigator.serviceWorker",
  "(display-mode: standalone)"
]) {
  if (!pwaBootstrap.includes(required)) throw new Error("PWA diagnostic missing " + required);
}

const sw = await readFile(path.join(root, "public/sw.js"), "utf8");
if (!sw.includes("self.registration.scope")) throw new Error("service worker must derive its base from registration scope");
if (!sw.includes("BUILD_ASSETS")) throw new Error("service worker must include build asset precache injection point");

for (const icon of ["icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png"]) {
  const s = await stat(path.join(root, "public/icons", icon));
  if (s.size < 100) throw new Error(`${icon} is unexpectedly small`);
}

const outDir = path.join(root, "out");
try {
  await access(outDir);
  for (const rel of [
    "index.html",
    "import/index.html",
    "membership/index.html",
    "poc/credential-verify/index.html",
    "poc/membership-credential-v1/index.html",
    "manifest.webmanifest",
    "sw.js"
  ]) {
    await access(path.join(outDir, rel));
  }
  const builtSw = await readFile(path.join(outDir, "sw.js"), "utf8");
  if (builtSw.includes("/*__BUILD_ASSETS__*/ []")) throw new Error("Built service worker precache assets were not injected");
  if (!builtSw.includes("./_next/static/")) throw new Error("Built service worker does not precache Next.js static assets");
  console.log("Static export output detected and verified.");
} catch {
  console.log("Source validation passed. Static export output is not present in this environment.");
}
