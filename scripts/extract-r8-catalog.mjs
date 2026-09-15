import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const EXPECTED_APK_SHA256 =
  "83d7d0ac82d91455978c0e5d8c6d673d43dd8e90836e9bec7a161597b407d659";
const EXPECTED_CATALOG_COUNT = 77;

const techniqueNames = [
  "팔꿈치굳히기(6교)",
  "합기떨어뜨리기",
  "외회전던지기",
  "내회전던지기",
  "입신던지기",
  "사방던지기",
  "손목뒤집기",
  "천지던지기",
  "허리던지기",
  "호흡던지기",
  "십자던지기",
  "구석던지기",
  "호흡법",
  "5교",
  "4교",
  "3교",
  "2교",
  "1교"
];

function fail(message) {
  throw new Error(`r8 catalog extraction failed: ${message}`);
}

function sliceBetween(source, startMarker, endMarker, startAt = 0) {
  const start = source.indexOf(startMarker, startAt);
  if (start < 0) fail(`missing marker ${JSON.stringify(startMarker)}`);
  const valueStart = start + startMarker.length;
  const end = source.indexOf(endMarker, valueStart);
  if (end < 0) fail(`missing marker ${JSON.stringify(endMarker)}`);
  return { value: source.slice(valueStart, end), end };
}

function parseExamTable(bundle) {
  const { value } = sliceBetween(bundle, "var O=", ",he=`");
  // The APK hash is pinned before this literal is evaluated.
  const table = Function(`"use strict"; return (${value});`)();
  if (!table || typeof table !== "object") fail("invalid exam table literal");
  return table;
}

function parseVideoTable(bundle) {
  const { value } = sliceBetween(bundle, ",he=`", "`,k=new Map");
  const rows = value.trim().split("\n");
  const linksByName = new Map();

  for (const row of rows) {
    const parts = row.split("|");
    if (parts.length !== 2 && parts.length !== 3) {
      fail(`invalid video row ${JSON.stringify(row)}`);
    }
    const name = parts[0];
    const url = parts.at(-1);
    const link = parts.length === 3 ? { label: parts[1], url } : { url };
    linksByName.set(name, [...(linksByName.get(name) ?? []), link]);
  }

  return { rows, linksByName };
}

function findTechnique(name) {
  return techniqueNames.find((technique) => name.includes(technique)) ?? "기타";
}

function createKata(name, grade, exam, hombu, linksByName) {
  const withoutSpecialPrefix = name.replace(
    /^(2인 잡기|단도 뺏기|검 뺏기|장 뺏기) /,
    ""
  );
  const form = withoutSpecialPrefix.startsWith("좌기 ")
    ? "좌기"
    : withoutSpecialPrefix.startsWith("반신반립 ")
      ? "반신반립"
      : "입기";
  const technique = findTechnique(name);
  const withoutForm = withoutSpecialPrefix.replace(/^(좌기|반신반립) /, "");
  const inferredAttack =
    withoutForm.slice(
      0,
      Math.max(0, withoutForm.lastIndexOf(` ${technique}`))
    ) || withoutForm;
  const attack =
    name === "맞서한손잡기에서 바로 넣는 2교"
      ? "맞서한손잡기"
      : name.startsWith("2인 잡기 ")
        ? "2인 잡기"
        : inferredAttack;
  const area = name.startsWith("2인 잡기 ")
    ? "다인 잡기"
    : /^(단도 뺏기|검 뺏기|장 뺏기) /.test(name)
      ? "무기 잡기"
      : technique === "호흡법"
        ? "호흡력"
        : "일반 체술";

  return {
    id: name.replace(/\s/g, "-"),
    nameKo: name,
    form,
    attack,
    technique,
    grade,
    hombu,
    exam,
    area,
    links: linksByName.get(name) ?? []
  };
}

function assertUnique(items, field) {
  const seen = new Set();
  for (const item of items) {
    if (seen.has(item[field])) fail(`duplicate ${field}: ${item[field]}`);
    seen.add(item[field]);
  }
}

function buildCatalog(apkPath) {
  const apk = readFileSync(apkPath);
  const sha256 = createHash("sha256").update(apk).digest("hex");
  if (sha256 !== EXPECTED_APK_SHA256) {
    fail(`APK SHA-256 ${sha256} does not match ${EXPECTED_APK_SHA256}`);
  }

  const entries = execFileSync("unzip", ["-Z1", apkPath], {
    encoding: "utf8"
  }).trim().split("\n");
  const pageBundles = entries.filter((entry) =>
    /^assets\/www\/assets\/page-.*\.js$/.test(entry)
  );
  const candidates = pageBundles.map((path) => ({
    path,
    source: execFileSync("unzip", ["-p", apkPath, path], {
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024
    })
  })).filter(({ source }) =>
    source.includes("var O=") && source.includes(",he=`")
  );
  if (candidates.length !== 1) {
    fail(`expected one catalog bundle, found ${candidates.length}`);
  }

  const [{ path: bundlePath, source: bundle }] = candidates;
  const examTable = parseExamTable(bundle);
  const { rows: videoRows, linksByName } = parseVideoTable(bundle);
  const examNames = Object.values(examTable).flatMap((grade) => grade.kata);
  const examNameSet = new Set(examNames);

  if (examNames.length !== examNameSet.size) {
    fail("duplicate canonical name in exam table");
  }

  const kata = [
    ...Object.entries(examTable).flatMap(([grade, value]) =>
      value.kata.map((name) =>
        createKata(name, Number(grade), true, true, linksByName)
      )
    ),
    ...[...linksByName.keys()]
      .filter((name) => !examNameSet.has(name))
      .map((name) =>
        createKata(
          name,
          null,
          false,
          name === "맞서한손잡기에서 바로 넣는 2교" ||
            !name.startsWith("맞서한손잡기에서"),
          linksByName
        )
      )
  ];

  if (kata.length !== EXPECTED_CATALOG_COUNT) {
    fail(`expected ${EXPECTED_CATALOG_COUNT} canonical Kata, found ${kata.length}`);
  }
  assertUnique(kata, "id");
  assertUnique(kata, "nameKo");
  for (const item of kata) {
    if (item.id !== item.nameKo.replace(/\s/g, "-")) {
      fail(`non-deterministic id for ${item.nameKo}`);
    }
  }

  return {
    catalogVersion: 1,
    generatedFrom: {
      artifact: "Samsungdang DojoLog Instructor beta 0.9.9-r8 APK",
      apkSha256: sha256,
      bundlePath,
      extraction: "r8 exam table + video table + canonical Kata factory"
    },
    sourceFacts: {
      examTableEntries: examNames.length,
      videoTableRows: videoRows.length,
      videoTableNames: linksByName.size,
      canonicalKata: kata.length
    },
    kata
  };
}

const [, , apkPath, outputPath] = process.argv;
if (!apkPath) {
  console.error("Usage: node scripts/extract-r8-catalog.mjs <r8.apk> [output.json]");
  process.exitCode = 2;
} else {
  const catalog = buildCatalog(apkPath);
  const json = `${JSON.stringify(catalog, null, 2)}\n`;
  if (outputPath) writeFileSync(outputPath, json);
  else process.stdout.write(json);
}
