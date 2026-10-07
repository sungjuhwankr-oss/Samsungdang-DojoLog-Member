import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import vm from "node:vm";
import { PRIMARY_NAVIGATION, MORE_NAVIGATION, normalizedNavigationPath, bindNavigationDismissal } from "../app/shell-navigation.mjs";
import { allowsSamsungdangFeature, createMembershipFeatureGate } from "../app/membership-gate.mjs";
import { getScrollControlState, scrollToBoundary } from "../app/scroll-controls.mjs";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const gateA = createMembershipFeatureGate({ valid: true, reason: "OK", credentialType: "membership", keyId: "key", credentialId: "id", verifiedPayload: {} });

test("B1 bottom navigation has exactly six final labels in order", () => {
  assert.deepEqual([...PRIMARY_NAVIGATION.map(item => item.label), "기타"], ["홈", "수련일지", "카타/심사표", "행사참여기록", "초심자용 교본", "기타"]);
});
test("B1 five direct destinations retain the existing route identities", () => {
  assert.deepEqual(PRIMARY_NAVIGATION.map(item => item.href), ["/", "/journal/", "/kata/", "/events/", "/beginner-videos/"]);
});
test("B1 기타 has the exact final destination and label order", () => {
  assert.deepEqual(MORE_NAVIGATION.map(item => [item.href, item.label]), [
    ["/onboarding/", "회원 전자 증명서 등록"], ["/membership-card/", "회원증"],
    ["/promotion-history/", "승단급 이력"], ["/backup/", "백업"], ["/manual/", "설명서"]
  ]);
});
test("B1 B hides only the existing two A-only destinations", () => {
  const gate = createMembershipFeatureGate(null);
  assert.deepEqual(MORE_NAVIGATION.filter(item => !item.feature || allowsSamsungdangFeature(gate, item.feature)).map(item => item.href), ["/onboarding/", "/backup/", "/manual/"]);
});
test("B1 A exposes both gated destinations and preserves the menu order", () => {
  assert.deepEqual(MORE_NAVIGATION.filter(item => !item.feature || allowsSamsungdangFeature(gateA, item.feature)), MORE_NAVIGATION);
});
test("B1 icon and text are both rendered without an icon dependency", async () => {
  const navigation = await read("app/components/app-navigation.tsx");
  assert.match(navigation, /<NavigationIcon name=\{item.icon\}/);
  assert.match(navigation, /className="navigation-label">\{item.label\}/);
  assert.match(navigation, /<NavigationIcon name="more"/);
  const icon = await read("app/components/navigation-icon.tsx");
  assert.match(icon, /aria-hidden="true"/);
  assert.match(icon, /focusable="false"/);
  assert.equal("lucide-react" in JSON.parse(await read("package.json")).dependencies, false);
});
test("B1 narrow layout reserves six equal non-clipping cells and touch targets", async () => {
  const css = await read("app/globals.css");
  assert.match(css, /repeat\(6, minmax\(0, 1fr\)\)/);
  assert.match(css, /min-height: 64px/);
  assert.match(css, /\.navigation-label[^}]*overflow-wrap: anywhere/);
  assert.doesNotMatch(css.slice(css.indexOf(".app-navigation"), css.indexOf(".dashboard-summary")), /text-overflow: ellipsis|white-space: nowrap/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
});
test("B1 pathname normalization handles root, Pages base and trailing slash", () => {
  assert.equal(normalizedNavigationPath("/Samsungdang-DojoLog-Member/manual", "/Samsungdang-DojoLog-Member"), "/manual/");
  assert.equal(normalizedNavigationPath("/Samsungdang-DojoLog-Member", "/Samsungdang-DojoLog-Member"), "/");
  assert.equal(normalizedNavigationPath("/journal/"), "/journal/");
  assert.equal(normalizedNavigationPath("/baseball", "/base"), "/baseball/");
});
function dismissalHarness() {
  const document = new EventTarget();
  let closes = 0, focus = 0;
  const inside = new EventTarget();
  const dispose = bindNavigationDismissal(document, target => target === inside, () => closes++, () => focus++);
  return { document, inside, dispose, get closes() { return closes; }, get focus() { return focus; } };
}
test("B1 outside pointer closes the menu", () => {
  const h = dismissalHarness();
  h.document.dispatchEvent(new Event("pointerdown"));
  assert.equal(h.closes, 1);
  h.dispose();
});
test("B1 pointer inside the menu does not close it", () => {
  const h = dismissalHarness();
  const event = new Event("pointerdown");
  Object.defineProperty(event, "target", { value: h.inside });
  h.document.dispatchEvent(event);
  assert.equal(h.closes, 0);
  h.dispose();
});
test("B1 Esc closes and returns keyboard focus to 기타", () => {
  const h = dismissalHarness();
  const event = new Event("keydown", { cancelable: true });
  Object.defineProperty(event, "key", { value: "Escape" });
  h.document.dispatchEvent(event);
  assert.equal(h.closes, 1);
  assert.equal(h.focus, 1);
  assert.equal(event.defaultPrevented, true);
  h.dispose();
});
test("B1 other keys do not dismiss and listeners clean up on close", () => {
  const h = dismissalHarness();
  const event = new Event("keydown");
  Object.defineProperty(event, "key", { value: "Enter" });
  h.document.dispatchEvent(event);
  h.dispose();
  h.document.dispatchEvent(new Event("pointerdown"));
  assert.equal(h.closes, 0);
});
test("B1 item selection closes, route changes remount closed, trigger toggles", async () => {
  const source = await read("app/components/app-navigation.tsx");
  assert.match(source, /href=\{item.href\} onClick=\{\(\) => setOpen\(false\)\}/);
  assert.match(source, /<NavigationForRoute key=\{pathname\}/);
  assert.match(source, /useState\(false\)/);
  assert.match(source, /setOpen\(value => !value\)/);
  assert.match(source, /aria-expanded=\{open\}/);
});
test("B2 manual route is available without B or A credential boundaries", async () => {
  await access(new URL("../app/manual/page.tsx", import.meta.url));
  const manual = await read("app/manual/page.tsx");
  assert.doesNotMatch(manual, /SamsungdangFeatureBoundary|hasValidMembershipCredential|useMembershipFeatureGate/);
  assert.equal(MORE_NAVIGATION.find(item => item.href === "/manual/").feature, undefined);
});
test("B2 manual includes all eight required sections and existing route links", async () => {
  const manual = await read("app/manual/page.tsx");
  for (const id of ["installation", "import", "journal", "kata", "events", "membership", "backup", "local-data"]) {
    assert.match(manual, new RegExp(`id="${id}"`));
  }
  for (const route of ["journal", "kata", "events", "beginner-videos", "onboarding", "membership", "promotion", "backup"]) {
    assert.match(manual, new RegExp(`href="/${route}/"`));
  }
});
test("B2 manual states current Backup v1 exclusions, replacement and local-data limitations", async () => {
  const manual = await read("app/manual/page.tsx");
  assert.match(manual, /Backup v1/);
  assert.match(manual, /개인수련·메모·공유 원본/);
  assert.match(manual, /교체의 영향을 받을 수/);
  assert.match(manual, /새 기기나 새 브라우저/);
  assert.match(manual, /자동 동기화되지 않습니다/);
  assert.doesNotMatch(manual, /Backup v2|Phase 4L|actual-device PASS|Phase 4K-E.*PASS/);
});
test("B2 export validator requires manual output and propagates invalid existing exports", async () => {
  const validator = await read("scripts/validate-phase1.mjs");
  assert.match(validator, /"manual\/index.html"/);
  assert.match(validator, /Built service worker does not handle the manual route/);
  // Missing out is optional for source-only validation; missing files in an existing out must fail.
  assert.ok(validator.indexOf("process.exit(0)") < validator.indexOf('"manual/index.html"'));
});
async function serviceWorkerHarness() {
  const handlers = new Map();
  const scope = "https://example.test/Samsungdang-DojoLog-Member/";
  const cached = [], precached = [];
  const context = {
    URL, Promise,
    self: { registration: { scope }, location: { origin: "https://example.test" }, addEventListener: (event, fn) => handlers.set(event, fn) },
    fetch: async () => { throw new Error("offline"); },
    caches: {
      open: async () => ({ addAll: async urls => precached.push(...urls) }),
      match: async value => {
        cached.push(value);
        return typeof value === "string" ? { cached: value } : undefined;
      }
    }
  };
  vm.runInNewContext(await read("public/sw.js"), context);
  return { handlers, scope, cached, precached };
}
test("B2 service worker install precaches the manual under the repository scope", async () => {
  const h = await serviceWorkerHarness();
  let pending;
  h.handlers.get("install")({ waitUntil: value => { pending = value; } });
  await pending;
  assert.ok(h.precached.includes(`${h.scope}manual/`));
});
for (const suffix of ["manual/", "manual", "manual/?from=menu"]) {
  test(`B2 offline navigation falls back to the correct manual shell: ${suffix}`, async () => {
    const h = await serviceWorkerHarness();
    let pending;
    h.handlers.get("fetch")({ request: { method: "GET", mode: "navigate", url: `${h.scope}${suffix}` }, respondWith: value => { pending = value; } });
    assert.deepEqual(await pending, { cached: `${h.scope}manual/` });
  });
}
test("B3 no diagnostic component is mounted in normal production pages", async () => {
  for (const route of ["import", "membership", "onboarding", "promotion", "special-training", "backup"]) {
    assert.doesNotMatch(await read(`app/${route}/page.tsx`), /Diagnostics|diag-title|연결 진단/);
  }
});
test("B3 common PWA panel has no developer diagnostics but retains registration and install lifecycle", async () => {
  const pwa = await read("app/components/pwa-bootstrap.tsx");
  assert.doesNotMatch(pwa, /Phase 1\.1|diag-grid|controllerStatus|registrationScope|installPromptStatus|<dt>/);
  for (const feature of ["navigator.serviceWorker.register", "beforeinstallprompt", "appinstalled", "installPrompt.prompt()", '(display-mode: standalone)']) assert.ok(pwa.includes(feature));
  assert.match(pwa, /Service worker registration failed/);
});
test("B3 journal no longer renders storage, URL or display-mode diagnostics", async () => {
  const journal = await read("app/components/training-log.tsx");
  assert.doesNotMatch(journal, /storage-diagnostic|TRAINING_DB_NAME|TRAINING_DB_VERSION|<dt>origin|<dt>database|display-mode/);
  assert.match(journal, /IndexedDB에서 수련일지를 읽을 수 없습니다/);
  assert.match(journal, /수련일지를 저장할 수 없습니다/);
});
test("B3 operation errors and confirmation previews remain available", async () => {
  const fragment = await read("app/components/fragment-probe.tsx");
  assert.match(fragment, /result.message/);
  assert.match(fragment, /수련기록을 저장하지 못했습니다/);
  assert.match(fragment, /payload.sessionNo/);
  for (const component of ["membership", "onboarding", "promotion", "special-training"]) {
    const source = await read(`app/components/${component}-registration-panel.tsx`);
    assert.match(source, /role="alert"/);
    assert.match(source, /credential-preview/);
  }
  assert.match(await read("app/components/backup-restore-panel.tsx"), /백업 작업을 완료하지 못했습니다/);
});
test("B4 short screens hide both scroll controls", () => {
  for (const scrollHeight of [500, 800, 1100]) assert.deepEqual(getScrollControlState({ scrollTop: 0, scrollHeight, viewportHeight: 800 }), { top: false, bottom: false });
});
test("B4 long-screen top shows only 맨 아래", () => {
  assert.deepEqual(getScrollControlState({ scrollTop: 0, scrollHeight: 3000, viewportHeight: 800 }), { top: false, bottom: true });
});
test("B4 long-screen middle shows 맨 위 and 맨 아래", () => {
  assert.deepEqual(getScrollControlState({ scrollTop: 1000, scrollHeight: 3000, viewportHeight: 800 }), { top: true, bottom: true });
});
test("B4 bottom and elastic overscroll show only 맨 위", () => {
  for (const scrollTop of [2200, 2250]) assert.deepEqual(getScrollControlState({ scrollTop, scrollHeight: 3000, viewportHeight: 800 }), { top: true, bottom: false });
  assert.deepEqual(getScrollControlState({ scrollTop: -50, scrollHeight: 3000, viewportHeight: 800 }), { top: false, bottom: true });
});
test("B4 scrolling changes only position and preserves draft, form and route state", () => {
  const calls = [];
  const target = {
    document: { documentElement: { scrollHeight: 3000 }, body: { scrollHeight: 2900 } },
    scrollTo: value => calls.push(value),
    location: { pathname: "/journal/", hash: "#session" },
    draft: { note: "입력 중", date: "2026-10-07", kata: ["saved-id"] },
    input: { value: "변경하지 않음" }
  };
  const before = JSON.stringify(target);
  scrollToBoundary(target, "bottom");
  scrollToBoundary(target, "top", true);
  assert.deepEqual(calls, [{ top: 3000, behavior: "smooth" }, { top: 0, behavior: "instant" }]);
  assert.equal(JSON.stringify(target), before);
});
test("B4 common controls reserve measured nav space, safe area and form-safe buttons", async () => {
  const [source, layout, css] = await Promise.all([read("app/components/scroll-controls.tsx"), read("app/layout.tsx"), read("app/globals.css")]);
  assert.match(layout, /<ScrollControls \/>/);
  assert.match(source, /ResizeObserver/);
  assert.match(source, /nav.getBoundingClientRect\(\).top/);
  assert.match(source, /observer.observe\(nav, \{ box: "border-box" \}\)/);
  assert.match(source, /type="button"/);
  assert.doesNotMatch(source, /history\.|location\.|localStorage|indexedDB|dispatchEvent|setValue|reset\(/);
  assert.match(css, /bottom: calc\(var\(--navigation-space, 110px\) \+ 12px\)/);
});
