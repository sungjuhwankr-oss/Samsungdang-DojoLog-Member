import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("personal session disclosure keeps native details behavior and a visible action label", async () => {
  const component = await read("app/components/training-log.tsx");
  assert.match(component, /<details className="create-session-box">\s*<summary className="create-session-toggle">/);
  assert.match(component, /<span className="create-session-toggle-icon" aria-hidden="true">＋<\/span>/);
  assert.match(component, /<span>개인수련 추가<\/span>/);
  assert.match(component, /<form className="compact-form" onSubmit=\{createPersonal\}>/);
});

test("personal session action has a scoped high-contrast touch target and focus state", async () => {
  const css = await read("app/globals.css");
  assert.match(css, /\.create-session-box > \.create-session-toggle\s*\{[^}]*min-height: 52px;[^}]*background: var\(--accent\);[^}]*color: var\(--accent-contrast\);/s);
  assert.match(css, /\.create-session-box\[open\] > \.create-session-toggle\s*\{[^}]*background: var\(--panel\);[^}]*color: var\(--accent\);/s);
  assert.match(css, /\.create-session-box > \.create-session-toggle:focus-visible\s*\{[^}]*outline:/s);
  assert.match(css, /\.create-session-toggle::after\s*\{[^}]*"펼치기"/s);
  assert.match(css, /\.create-session-box\[open\] > \.create-session-toggle::after\s*\{[^}]*"접기"/s);
});
