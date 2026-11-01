import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../app/components/event-manager.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const specialCards = source.split("domain.verified.filter(event => matches")[1]?.split("activeExternal.filter(event => matches")[0] ?? "";

test("E3 UX: each verified special-training event defaults to a collapsible detail", () => {
  assert.match(specialCards, /<article className="event-card" key=\{eventKey\}>\s*<details className="event-collapsible">/);
  assert.match(specialCards, /<summary className="event-summary">/);
  assert.doesNotMatch(specialCards, /<details className="event-collapsible"[^>]*\sopen(?:\s|=|>)/);
  assert.match(specialCards, /저장된 참가 \$\{savedSelected\.size\}\/\$\{totalSessions\}회/);
  assert.match(specialCards, /미저장 변경/);
  assert.match(specialCards, /참가 회차 0회 \(v1\)/);
  assert.match(css, /\.event-summary:focus-visible/);
});

test("E3 UX: each v2 participation save has local pending, success and error feedback", () => {
  assert.match(source, /const savingParticipationIds = useRef\(new Set<string>\(\)\)/);
  assert.match(source, /if \(savingParticipationIds\.current\.has\(eventId\)\) return/);
  assert.match(source, /await updateSpecialParticipation\(eventId, selectedSessionIds\)/);
  assert.match(source, /kind: "saving", message: "참가 기록을 저장 중입니다\."/);
  assert.match(source, /kind: "success", message: `참가 기록을 저장했습니다\. 현재 참가 \$\{selectedSessionIds\.length\}회`/);
  assert.match(source, /kind: "error", message: "참가 기록을 저장하지 못했습니다\. 기존 기록은 유지됩니다\."/);
  assert.match(specialCards, /disabled=\{saving\}[\s\S]*?>\s*\{saving \? "저장 중…" : "참가 선택 저장"\}/);
  assert.match(specialCards, /role=\{feedback\.kind === "error" \? "alert" : "status"\}>\{feedback\.message\}/);
  assert.match(source, /delete next\[eventId\]/);
});
