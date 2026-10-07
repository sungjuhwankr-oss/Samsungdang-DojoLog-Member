import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createExamTable, getCurrentKataPresentation } from "../app/kata-library.mjs";
import { groupKataForPresentation, orderHombuKataPresentation, kataVideoActions, kataExamBadges } from "../app/kata-presentation.mjs";
import { createMemoryJournalRepository } from "../app/training-journal.mjs";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const catalogBytes = await read("reference/kata-catalog.v2.json");
const catalog = JSON.parse(catalogBytes);
const expected = JSON.parse(await read("tests/fixtures/pre-resume-kata-presentation.json"));
const journal = await read("app/components/training-log.tsx");
const library = await read("app/components/kata-library.tsx");
const video = await read("app/components/kata-video.tsx");
const css = await read("app/globals.css");
const first = catalog.kata[0], last = catalog.kata.at(-1);
const inputKata = [last, first].map(k => ({ id: k.id, name: k.nameKo }));
const groups = () => groupKataForPresentation(catalog);

test("C1 view/edit form keeps date, shared restriction, Kata, memo, actions in exact order", () => {
  const form = journal.slice(journal.indexOf('<form className="compact-form session-edit-form"'), journal.indexOf("</form>"));
  const positions = ['날짜', '{shared && <p', '<fieldset>', '메모', '<div className="button-row">'].map(text => form.indexOf(text));
  assert.ok(positions.every(position => position >= 0));
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
});
test("C1 personal add form keeps training date, Kata, memo, save in exact order", () => {
  const start = journal.indexOf('<form className="compact-form" onSubmit={createPersonal}>');
  const form = journal.slice(start, journal.indexOf("</form>", start));
  const positions = ['수련일', '<fieldset>', '메모', '개인수련 저장'].map(text => form.indexOf(text));
  assert.ok(positions.every(position => position >= 0));
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
});
test("C1 shared restriction stays conditional and date stays disabled only for shared sessions", () => {
  assert.match(journal, /const shared = record.source === "shared"/);
  assert.match(journal, /type="date" value=\{date\} disabled=\{shared\}/);
  assert.match(journal, /\{shared && <p[^>]*>공유수업의 dojo·수업번호·날짜는 변경할 수 없습니다/);
  assert.match(journal, /!shared && <button[^>]*onClick=\{removePersonal\}/);
});
test("C1 selected and snapshot rows use the shared current-catalog video chips", () => {
  assert.equal([...journal.matchAll(/<KataVideo id=\{kata.id\}/g)].length, 2);
  assert.match(video, /getCurrentKataPresentation\(kataCatalog, id\)/);
  assert.match(video, /className="secondary-button kata-video-button"/);
  assert.match(css, /\.kata-video-button[^}]*text-decoration: none/);
  assert.doesNotMatch(journal, /saved-kata-video-links|영상 보기|href=\{link.url\}/);
});
test("C1 picker uses exactly four presentation optgroups while filtering selected IDs only", () => {
  assert.match(journal, /const groups = groupKataForPresentation\(kataCatalog\)/);
  assert.match(journal, /<optgroup key=\{group.id\} label=\{group.label\}/);
  assert.match(journal, /group.kata.filter\(\(kata\) => !values.some\(\(value\) => value.id === kata.id\)\)/);
  assert.match(journal, /onChange\(\[\.\.\.values, \{ id: kata.id, name: kata.nameKo \}\]\)/);
  assert.doesNotMatch(journal, /values\.sort|record.kata\.sort|snapshot.kata\.sort/);
});
test("C1 existing session identity and reversed stored Kata order survive presentation and memo editing", async () => {
  const repository = createMemoryJournalRepository();
  const original = await repository.createPersonal({ date: "2026-10-07", note: "기존 메모", kata: inputKata });
  const before = await repository.list();
  groups(); orderHombuKataPresentation(catalog.kata);
  assert.deepEqual(await repository.list(), before);
  const edited = await repository.update(original.dojo, original.sessionNo, { date: original.date, note: "수정 메모", kata: original.kata });
  assert.equal(edited.dojo, original.dojo); assert.equal(edited.sessionNo, original.sessionNo);
  assert.deepEqual(edited.kata, original.kata);
  assert.equal(edited.note, "수정 메모");
});
test("C1 shared original restore preserves memo, immutable identity and original Kata order", async () => {
  const session = { dojo: "samsungdang", sessionNo: 1070, date: "2026-10-07", source: "shared", importedAt: "2026-10-07T00:00:00Z", sourceSchema: "samsungdang-dojolog-session", sourceVersion: 1, note: "보존 메모" };
  const kata = inputKata.map((k, order) => ({ dojo: session.dojo, sessionNo: session.sessionNo, kataId: k.id, kataName: k.name, order }));
  const repository = createMemoryJournalRepository({ trainingSession: [session], sessionKata: kata });
  const original = (await repository.list())[0];
  const snapshot = await repository.getSnapshot(session.dojo, session.sessionNo);
  await repository.update(session.dojo, session.sessionNo, { date: session.date, note: "새 메모", kata: [inputKata[1]] });
  const restored = await repository.restore(session.dojo, session.sessionNo);
  assert.deepEqual(restored.kata, original.kata); assert.equal(restored.note, "새 메모");
  assert.equal(restored.date, session.date); assert.equal(restored.sessionNo, session.sessionNo);
  assert.deepEqual(await repository.getSnapshot(session.dojo, session.sessionNo), snapshot);
  await assert.rejects(repository.update(session.dojo, session.sessionNo, { date: "2026-10-06", kata: inputKata }), /immutable/);
});
test("C1 shared controls still invoke the existing original/restore paths without rewriting note", () => {
  assert.match(journal, /await getSharedSessionSnapshot\(record.dojo, record.sessionNo\)/);
  assert.match(journal, /await restoreSharedTrainingSession\(record.dojo, record.sessionNo\)/);
  assert.match(journal, /setKata\(restored.kata.map/); assert.match(journal, /setNote\(restored.note\)/);
  assert.match(journal, /await updateTrainingSession\(record.dojo, record.sessionNo, \{ date, note, kata \}\)/);
});

test("C2 exactly four groups cover every stable canonical ID once", () => {
  assert.deepEqual(groups().map(g => [g.id, g.label, g.kata.length]), [
    ["taijutsu", "기본 체술", 64], ["sword-knife", "검/단도", 15], ["jo", "장", 15], ["multi-other", "2인 이상", 3]
  ]);
  assert.deepEqual(groups().flatMap(g => g.kata.map(k => k.id)).sort(), catalog.kata.map(k => k.id).sort());
});
for (const expectedGroup of expected.groups) {
  test(`C1/C2 ${expectedGroup.label} exact internal ordering matches executed Instructor comparator`, () => {
    assert.deepEqual(groups().find(g => g.id === expectedGroup.id).kata.map(k => k.id), expectedGroup.ids);
  });
}
test("C1/C2 sorting projects a copy and leaves canonical objects and ordering unchanged", () => {
  const before = structuredClone(catalog);
  const sorted = orderHombuKataPresentation(Object.freeze([...catalog.kata]));
  assert.notEqual(sorted, catalog.kata);
  assert.ok(groups().every(g => g.kata.every(k => catalog.kata.includes(k))));
  assert.deepEqual(catalog, before);
});
test("C2 Kata library removes every descriptive details expansion and renders fixed rows", () => {
  assert.match(library, /<article className="kata-row" id=\{`kata-\$\{kata.id\}`\}/);
  assert.doesNotMatch(library, /<details|<summary|<dl|<dt|kata-metadata|KataDetail/);
});
test("C2 row order is exact Kata name, video, exam badge", () => {
  const row = library.slice(library.indexOf("function KataRow"), library.indexOf("export function KataLibrary"));
  const positions = ["{kata.nameKo}", "<KataVideo", 'className="kata-exam-badges"'].map(text => row.indexOf(text));
  assert.ok(positions.every(position => position >= 0));
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
});
test("C2 library and journal use the same four-group projection", () => {
  assert.match(library, /groupKataForPresentation\(kataCatalog\)/);
  assert.match(journal, /groupKataForPresentation\(kataCatalog\)/);
  assert.doesNotMatch(library, /groupKataByCategory|KATA_CATEGORIES/);
});
test("C2 real omote/ura sources produce only their exact labeled actions", () => {
  const k = catalog.kata.find(k => k.nameKo === "맞서한손잡기 입신던지기");
  assert.deepEqual(kataVideoActions(k.links), [
    { label: "영상(오모테)", url: "https://youtu.be/9fULsFpH3oE?t=1243s" },
    { label: "영상(우라)", url: "https://youtu.be/9fULsFpH3oE?t=1614s" }
  ]);
});
test("C2 a single generic authoritative video is labeled 영상", () => {
  assert.deepEqual(kataVideoActions(first.links), [{ label: "영상", url: first.links[0].url }]);
});
test("C2 multiple generic authoritative videos receive numbered generic labels", () => {
  const k = catalog.kata.find(k => k.nameKo === "양손잡기 허리던지기");
  assert.deepEqual(kataVideoActions(k.links), k.links.map((link, index) => ({ label: `영상 ${index + 1}`, url: link.url })));
});
test("C2 an omote-only source cannot infer or duplicate a nonexistent ura", () => {
  assert.deepEqual(kataVideoActions([{ label: "오모테", url: first.links[0].url }]), [{ label: "영상(오모테)", url: first.links[0].url }]);
});
test("C2 an ura-only source cannot infer or duplicate a nonexistent omote", () => {
  assert.deepEqual(kataVideoActions([{ label: "우라", url: first.links[0].url }]), [{ label: "영상(우라)", url: first.links[0].url }]);
});
test("C2 numeric and unrecognized generic labels cannot be renamed omote/ura", () => {
  for (const label of [undefined, "1", "2", "generic"]) {
    assert.deepEqual(kataVideoActions([{ label, url: first.links[0].url }]), [{ label: "영상", url: first.links[0].url }]);
  }
});
test("C2 empty sources show 영상 없음; unknown saved IDs never acquire fuzzy video links", () => {
  assert.deepEqual(kataVideoActions([]), []);
  assert.equal(getCurrentKataPresentation(catalog, "검-아와세-1번").status, "no-video");
  assert.equal(getCurrentKataPresentation(catalog, "unknown").status, "unknown");
  assert.match(video, /status === "no-video"[^]*?영상 없음/);
  assert.match(video, /status === "unknown"[^]*?카탈로그 외 기록/);
});
test("C2 every authoritative link is preserved in source order without changing source metadata", () => {
  const before = structuredClone(catalog);
  for (const k of catalog.kata) assert.deepEqual(kataVideoActions(k.links).map(a => a.url), k.links.map(l => l.url));
  assert.deepEqual(catalog, before);
});
test("C2 all kyu-linked badges have exact N급 labels and correct section anchors", () => {
  for (const k of catalog.kata.filter(k => k.examEntries.some(e => e.track === "kyu"))) {
    assert.deepEqual(kataExamBadges(k), k.examEntries.filter(e => e.track === "kyu").map(e => ({ label: `${e.grade}급`, anchor: `exam-grade-${e.grade}` })));
  }
});
test("C2 both dan-only badges say 유단자용 and link to the dan section", () => {
  for (const id of ["13의-장", "31의-장"]) assert.deepEqual(kataExamBadges(catalog.kata.find(k => k.id === id)), [{ label: "유단자용", anchor: "exam-dan" }]);
});
test("C2 all non-exam badges say 심사표 외 without an invented exam target", () => {
  for (const k of catalog.kata.filter(k => !k.examEntries.length)) assert.deepEqual(kataExamBadges(k), [{ label: "심사표 외", anchor: null }]);
});
test("C2 badge clicks retain full-table navigation and scroll to the correct grade anchor", () => {
  assert.match(library, /onClick=\{\(\) => openExam\(anchor\)\}/);
  assert.match(library, /function openExam\(anchor: string\)[^]*?setView\("exam"\);[^]*?setPendingAnchor\(anchor\)/);
  assert.match(library, /getElementById\(pendingAnchor\)\?\.scrollIntoView/);
});
test("C2 canonical 97 IDs/names/order/exam/video bytes remain exact", () => {
  assert.equal(createHash("sha256").update(catalogBytes).digest("hex"), expected.catalogSha256);
  assert.equal(expected.catalogSha256, "77931dd1303a526fc31bd2fef1d910ca319f9ea70f4eb56a03040e832a84c629");
});

test("C3 all authoritative grade item identities and numbering order remain exact", () => {
  assert.deepEqual(createExamTable(catalog).kyu.map(s => ({ grade: s.grade, ids: s.kata.map(k => k.id) })), expected.exam);
  assert.deepEqual(createExamTable(catalog).dan.map(k => k.id), expected.dan);
});
test("C3 presentation sorting cannot change the 77 kyu and 2 dan-only exam entries", () => {
  const before = createExamTable(catalog);
  groups();
  assert.deepEqual(createExamTable(catalog), before);
  assert.equal(before.kyu.flatMap(s => s.kata).length, 77); assert.equal(before.dan.length, 2);
});
test("C3 top jumps stay 9급 through 1급 followed by 유단자용", () => {
  assert.deepEqual(createExamTable(catalog).kyu.map(s => s.grade), [9, 8, 7, 6, 5, 4, 3, 2, 1]);
  const nav = library.slice(library.indexOf('<nav className="exam-anchor-navigation"'), library.indexOf("</nav>"));
  assert.match(nav, /examTable.kyu.map/); assert.match(nav, /href=\{`#exam-grade-\$\{section.grade\}`\}/);
  assert.match(nav, /<a href="#exam-dan">유단자용<\/a>/);
});
test("C3 cumulative exam text, authoritative ordered lists and full sections are retained", () => {
  assert.match(library, /응시 급까지 앞 급수의 심사항목을 누적/);
  assert.match(library, /<ol>\{section.kata.map/); assert.match(library, /<ol>\{examTable.dan.map/);
  assert.match(library, /createExamTable\(kataCatalog\)/);
});
test("C3 Kata names are plain text and cannot reverse-navigate to library", () => {
  assert.doesNotMatch(library, /href=\{`#kata-|onClick=\{\(\) => setView\("library"\)\}>\{kata.nameKo\}/);
  assert.doesNotMatch(library, /<a[^>]*>\{kata.nameKo\}<\/a>/);
  assert.equal([...library.matchAll(/<span>\{kata.nameKo\}<\/span>/g)].length, 2);
});
test("C3 both kyu and dan exam lists directly use the same video controls as library", () => {
  assert.equal([...library.matchAll(/<KataVideo id=\{kata.id\}/g)].length, 3);
  assert.match(video, /kataVideoActions\(presentation.links\)/);
  assert.match(video, /href=\{action.url\} target="_blank" rel="noreferrer"/);
});
test("C3 video join is current canonical ID only and does not modify examEntries", () => {
  assert.match(video, /getCurrentKataPresentation\(kataCatalog, id\)/);
  assert.doesNotMatch(library + journal + video, /examEntries\s*=|examEntries\.push|kataCatalog\.kata\.sort|localStorage\.setItem/);
});
