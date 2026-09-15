import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const catalog = JSON.parse(
  await readFile(new URL("../reference/kata-catalog.v1.json", import.meta.url), "utf8")
);
const terminology = JSON.parse(
  await readFile(new URL("../reference/terminology.v1.json", import.meta.url), "utf8")
);

function findTerm(ko) {
  return terminology.terms.find((term) => term.ko === ko);
}

function findKata(nameKo) {
  return catalog.kata.find((kata) => kata.nameKo === nameKo);
}

test("catalog v1 has the complete r8 canonical shape", () => {
  assert.equal(catalog.catalogVersion, 1);
  assert.equal(catalog.generatedFrom.apkSha256, "83d7d0ac82d91455978c0e5d8c6d673d43dd8e90836e9bec7a161597b407d659");
  assert.equal(catalog.sourceFacts.canonicalKata, 77);
  assert.equal(catalog.kata.length, 77);

  for (const kata of catalog.kata) {
    assert.deepEqual(
      Object.keys(kata),
      ["id", "nameKo", "form", "attack", "technique", "grade", "hombu", "exam", "area", "links"]
    );
    assert.equal(typeof kata.id, "string");
    assert.equal(typeof kata.nameKo, "string");
    assert.equal(typeof kata.form, "string");
    assert.equal(typeof kata.attack, "string");
    assert.equal(typeof kata.technique, "string");
    assert.ok(kata.grade === null || Number.isInteger(kata.grade));
    assert.equal(typeof kata.hombu, "boolean");
    assert.equal(typeof kata.exam, "boolean");
    assert.equal(typeof kata.area, "string");
    assert.ok(Array.isArray(kata.links));
  }
});

test("canonical Kata ids and Korean names are unique and deterministic", () => {
  const ids = catalog.kata.map((kata) => kata.id);
  const names = catalog.kata.map((kata) => kata.nameKo);
  assert.equal(new Set(ids).size, 77);
  assert.equal(new Set(names).size, 77);
  for (const kata of catalog.kata) {
    assert.equal(kata.id, kata.nameKo.replace(/\s/g, "-"));
  }
});

test("Phase 4A sample canonical identity is unchanged", () => {
  const kata = findKata("뒤양손잡기 허리던지기");
  assert.equal(kata.id, "뒤양손잡기-허리던지기");
  assert.equal(kata.nameKo, "뒤양손잡기 허리던지기");
});

test("exam metadata covers the complete r8 exam table", () => {
  const exam = catalog.kata.filter((kata) => kata.exam);
  assert.equal(catalog.sourceFacts.examTableEntries, 59);
  assert.equal(exam.length, 59);
  assert.deepEqual(
    Object.fromEntries(
      [...new Set(exam.map((kata) => kata.grade))]
        .sort((left, right) => left - right)
        .map((grade) => [grade, exam.filter((kata) => kata.grade === grade).length])
    ),
    { 1: 7, 2: 8, 3: 6, 4: 8, 5: 11, 6: 8, 7: 5, 8: 4, 9: 2 }
  );
  assert.ok(exam.every((kata) => Number.isInteger(kata.grade) && kata.grade >= 1 && kata.grade <= 9));
  assert.ok(catalog.kata.filter((kata) => !kata.exam).every((kata) => kata.grade === null));
});

test("Hombu and video metadata match the r8 source facts", () => {
  assert.equal(catalog.kata.filter((kata) => kata.hombu).length, 77);
  assert.equal(catalog.kata.filter((kata) => kata.links.length > 0).length, 73);
  assert.equal(catalog.kata.flatMap((kata) => kata.links).length, 106);
  assert.equal(catalog.sourceFacts.videoTableNames, 73);
  assert.equal(catalog.sourceFacts.videoTableRows, 106);

  for (const link of catalog.kata.flatMap((kata) => kata.links)) {
    assert.match(link.url, /^https:\/\/youtu\.be\/[A-Za-z0-9_-]+\?t=\d+$/);
    if ("label" in link) assert.ok(link.label.length > 0);
  }
});

test("r8 special Hombu Kata are present with source metadata unchanged", () => {
  const names = [
    "2인 잡기 사방던지기",
    "2인 잡기 호흡던지기 1",
    "2인 잡기 호흡던지기 2",
    "단도 뺏기 좌기 정면타 5교",
    "단도 뺏기 횡면타 5교",
    "단도 뺏기 찌르기 팔꿈치굳히기(6교)",
    "단도 뺏기 찌르기 손목뒤집기",
    "단도 뺏기 횡면타 사방던지기",
    "검 뺏기 손목뒤집기",
    "검 뺏기 호흡던지기",
    "장 뺏기 입신던지기",
    "장 뺏기 호흡던지기",
    "장 뺏기 사방던지기"
  ];

  for (const name of names) {
    const kata = findKata(name);
    assert.ok(kata, name);
    assert.equal(kata.exam, false, name);
    assert.equal(kata.hombu, true, name);
    assert.ok(kata.links.length > 0, name);
  }

  assert.equal(findKata("검 뺏기 손목뒤집기").attack, "손목뒤집기");
  assert.equal(findKata("장 뺏기 입신던지기").attack, "입신던지기");
});

test("terminology v1 has a minimal searchable schema", () => {
  assert.equal(terminology.terminologyVersion, 1);
  assert.equal(terminology.generatedFrom.pdfSha256, "16abb6589f9bb29a459350e0983e6f8d83975216c1f29e861358dc9f438ee905");
  assert.equal(terminology.terms.length, 75);

  for (const term of terminology.terms) {
    const requiredKeys = ["id", "category", "ko", "ja", "romaji", "aliases", "source"];
    assert.ok(requiredKeys.every((key) => Object.hasOwn(term, key)), term.ko);
    assert.ok(
      Object.keys(term).every((key) => [...requiredKeys, "alternates"].includes(key)),
      term.ko
    );
    assert.ok(term.id.length > 0);
    assert.ok(term.category.length > 0);
    assert.ok(term.ko.length > 0);
    assert.ok(term.ja.length > 0);
    assert.ok(term.romaji === null || term.romaji.length > 0);
    assert.ok(Array.isArray(term.aliases));
    assert.ok(term.source.length > 0);
    if (term.alternates) {
      assert.ok(Array.isArray(term.alternates));
      for (const alternate of term.alternates) {
        assert.deepEqual(Object.keys(alternate), ["ja", "romaji"]);
        assert.ok(alternate.ja.length > 0);
        assert.ok(alternate.romaji.length > 0);
      }
    }
  }
});

test("terminology ids, Korean identities, and aliases have no duplicates", () => {
  assert.equal(new Set(terminology.terms.map((term) => term.id)).size, terminology.terms.length);
  assert.equal(new Set(terminology.terms.map((term) => term.ko)).size, terminology.terms.length);
  for (const term of terminology.terms) {
    assert.equal(new Set(term.aliases).size, term.aliases.length, term.ko);
    assert.ok(term.aliases.every((alias) => typeof alias === "string" && alias.length > 0));
    assert.ok(!term.aliases.includes(term.ko), term.ko);
    assert.ok(!term.aliases.includes(term.ja), term.ko);
    if (term.romaji !== null) assert.ok(!term.aliases.includes(term.romaji), term.ko);
  }
});

test("terminology categories retain the Phase 4B source distribution", () => {
  const grouped = Object.groupBy(terminology.terms, (term) => term.category);
  assert.deepEqual(
    Object.fromEntries(Object.entries(grouped).map(([category, terms]) => [category, terms.length])),
    {
      basic: 25,
      weaponPractice: 4,
      weapon: 2,
      attack: 11,
      technique: 21,
      form: 3,
      weaponDefense: 3,
      modifier: 2,
      specialKata: 4
    }
  );
  assert.equal(terminology.terms.filter((term) => term.source.includes("pdf")).length, 55);
});

test("catalog form, attack, and technique terminology is covered without invented compounds", () => {
  const KoreanTerms = new Set(terminology.terms.map((term) => term.ko));
  const componentRules = new Map([
    ["맞서한손잡기", ["맞서", "한손잡기"]],
    ["엇서한손잡기", ["엇서", "한손잡기"]]
  ]);
  const isCovered = (value) =>
    KoreanTerms.has(value) || componentRules.get(value)?.every((part) => KoreanTerms.has(part));

  for (const kata of catalog.kata) {
    assert.ok(isCovered(kata.form), `form: ${kata.form}`);
    assert.ok(isCovered(kata.attack), `attack: ${kata.attack}`);
    assert.ok(isCovered(kata.technique), `technique: ${kata.technique}`);
  }
});

test("project override wins for Sumi-otoshi while PDF values remain aliases", () => {
  const term = findTerm("구석던지기");
  assert.equal(term.ja, "隅落とし");
  assert.equal(term.romaji, "Sumi-otoshi");
  assert.ok(term.aliases.includes("隅落し"));
  assert.ok(term.aliases.includes("sumiotoshi"));
});

test("Morotedori primary and katateryotedori alternate remain paired under one Korean identity", () => {
  const term = findTerm("한손양손잡기");
  assert.equal(term.ko, "한손양손잡기");
  assert.equal(term.ja, "諸手取り");
  assert.equal(term.romaji, "morotedori");
  assert.deepEqual(term.alternates, [
    {
      ja: "片手両手取り",
      romaji: "katateryotedori"
    }
  ]);
  assert.equal(terminology.terms.filter((item) => item.ko === "한손양손잡기").length, 1);
});

test("Suwariwaza is general and Zagi Kokyuho remains the one explicit exception", () => {
  assert.deepEqual(
    { ja: findTerm("좌기").ja, romaji: findTerm("좌기").romaji },
    { ja: "座技", romaji: "Suwariwaza" }
  );
  assert.deepEqual(
    { ja: findTerm("좌기 호흡법").ja, romaji: findTerm("좌기 호흡법").romaji },
    { ja: "座技 呼吸法", romaji: "Zagi Kokyuho" }
  );
});

test("Tachi-waza and Omote/Ura are terminology, not new Kata identities", () => {
  assert.deepEqual(
    { ja: findTerm("입기").ja, romaji: findTerm("입기").romaji },
    { ja: "立ち技", romaji: "Tachi-waza" }
  );
  assert.deepEqual(
    [findTerm("오모테"), findTerm("우라")].map(({ ko, ja, romaji }) => ({ ko, ja, romaji })),
    [
      { ko: "오모테", ja: "表", romaji: "Omote" },
      { ko: "우라", ja: "裏", romaji: "Ura" }
    ]
  );
  assert.ok(catalog.kata.every((kata) => !/오모테|우라/.test(kata.id)));
});

test("weapon practice terminology preserves the PDF spellings", () => {
  const expected = [
    ["수부리", "素振り", "suburi"],
    ["장", "杖", "jo"],
    ["검", "剣", "ken"],
    ["장 상대연습", "杖の会わせ", "jo no awase"],
    ["검 상대연습", "剣の会わせ", "ken no awase"],
    ["쿠미타치", "組太刀", "kumitachi"]
  ];
  for (const [ko, ja, romaji] of expected) {
    assert.deepEqual({ ja: findTerm(ko).ja, romaji: findTerm(ko).romaji }, { ja, romaji });
  }
});

test("weapon defense terminology uses the authoritative project values", () => {
  const expected = [
    ["단도 뺏기", "短刀取り", "Tanto-dori"],
    ["검 뺏기", "太刀取り", "Tachi-dori"],
    ["장 뺏기", "杖取り", "Jo-dori"]
  ];
  for (const [ko, ja, romaji] of expected) {
    assert.deepEqual({ ja: findTerm(ko).ja, romaji: findTerm(ko).romaji }, { ja, romaji });
  }
});

test("all authoritative added attack and technique overrides are fixed", () => {
  const expected = [
    ["양어깨잡기", "両肩取り", "Ryo-katadori"],
    ["뒤양어깨잡기", "後ろ両肩取り", "Ushiro-ryokatadori"],
    ["2인 잡기", "二人取り", "Ninin-dori"],
    ["내회전던지기", "内回転投げ", "Uchi-kaiten-nage"],
    ["외회전던지기", "外回転投げ", "Soto-kaiten-nage"],
    ["십자던지기", "十字投げ", "Juji-nage"],
    ["호흡법", "呼吸法", "Kokyuho"],
    ["팔꿈치굳히기(6교)", "肘決め(六教）", "Hiji-kime(Rokkyo)"],
    ["반신반립", "半身半立ち", "Hanmi-handachi"]
  ];
  for (const [ko, ja, romaji] of expected) {
    assert.deepEqual({ ja: findTerm(ko).ja, romaji: findTerm(ko).romaji }, { ja, romaji });
  }
});

test("special Kata terminology maps to canonical r8 identities", () => {
  const directNikyo = findTerm("맞서한손잡기에서 바로 넣는 2교");
  assert.equal(directNikyo.ja, "相半身片手取り二教(応用)");
  assert.equal(directNikyo.romaji, "Ai-hanmi katate-dori Nikyo(Oyo)");

  for (const term of terminology.terms.filter((item) => item.category === "specialKata")) {
    const kata = findKata(term.ko);
    assert.ok(kata, term.ko);
    assert.equal(kata.id, term.id);
  }
});

test("two-person Kokyunage Japanese names retain Arabic suffixes 1 and 2", () => {
  assert.equal(findTerm("2인 잡기 호흡던지기 1").ja, "二人取り呼吸投げ1");
  assert.equal(findTerm("2인 잡기 호흡던지기 1").romaji, "Ninin-dori kokyunage 1");
  assert.equal(findTerm("2인 잡기 호흡던지기 2").ja, "二人取り呼吸投げ2");
  assert.equal(findTerm("2인 잡기 호흡던지기 2").romaji, "Ninin-dori kokyunage 2");
  assert.ok(findKata("2인 잡기 호흡던지기 1"));
  assert.ok(findKata("2인 잡기 호흡던지기 2"));
});

test("Gyaku-hanmi override replaces the damaged PDF romanization without losing provenance", () => {
  const term = findTerm("엇서");
  assert.deepEqual(
    { ko: term.ko, ja: term.ja, romaji: term.romaji },
    { ko: "엇서", ja: "逆半身", romaji: "Gyaku-hanmi" }
  );
  assert.deepEqual(term.aliases, ["갸쿠한미"]);
  assert.ok(!term.aliases.includes("`"));
  const note = terminology.sourceNotes.find((item) => item.termId === "엇서");
  assert.equal(note.pdfValue, "`");
  assert.equal(note.resolvedValue, "Gyaku-hanmi");
  assert.deepEqual(terminology.terms.filter((item) => item.romaji === null), []);
});
