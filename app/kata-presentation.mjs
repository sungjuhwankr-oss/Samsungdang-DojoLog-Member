import { getKataExamLabels } from "./kata-library.mjs";

// Presentation projection only. The canonical catalog and saved lesson order are untouched.
export const KATA_PRESENTATION_GROUPS = Object.freeze([
  Object.freeze({ id: "taijutsu", label: "기본 체술", categoryIds: Object.freeze(["taijutsu"]) }),
  Object.freeze({ id: "sword-knife", label: "검/단도", categoryIds: Object.freeze(["ken", "tanto"]) }),
  Object.freeze({ id: "jo", label: "장", categoryIds: Object.freeze(["jo"]) }),
  Object.freeze({ id: "multi-other", label: "2인 이상", categoryIds: Object.freeze(["multi-other"]) })
]);

// Instructor app/recommendation.ts TECH_CATEGORY_ORDER and categoryOf,
// app/kata-presentation.ts orderHombuKatas at Work Unit A 0e07c242.
const TECHNIQUE_ORDER = Object.freeze([
  "1교", "2교", "3교", "4교", "5교", "입신던지기", "사방던지기", "손목뒤집기",
  "천지던지기", "회전던지기", "호흡던지기", "입기 호흡법", "십자던지기", "허리던지기", "합기떨어뜨리기"
]);

// Match the Instructor app's named technique headings while retaining the
// Member app's four existing top-level catalogue groups and all 97 IDs.
export const HOMBU_TECHNIQUE_HEADINGS = TECHNIQUE_ORDER;

function techniqueCategory(kata) {
  if (kata.nameKo === "엇서한손잡기 구석던지기") return "호흡던지기";
  if (kata.technique === "내회전던지기" || kata.technique === "외회전던지기") return "회전던지기";
  if (kata.technique === "호흡법") return "입기 호흡법";
  return kata.technique;
}

function techniqueOrder(kata) {
  const index = TECHNIQUE_ORDER.indexOf(techniqueCategory(kata));
  return index < 0 ? TECHNIQUE_ORDER.length : index;
}

export function orderHombuKataPresentation(kata) {
  return [...kata].sort((left, right) => techniqueOrder(left) - techniqueOrder(right)
    || techniqueCategory(left).localeCompare(techniqueCategory(right), "ko")
    || left.nameKo.localeCompare(right.nameKo, "ko"));
}

export function groupKataForPresentation(catalog) {
  return KATA_PRESENTATION_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    kata: orderHombuKataPresentation(catalog.kata.filter((kata) => group.categoryIds.includes(kata.categoryId)))
  }));
}

export function groupKataForLibrarySections(group) {
  const { id, kata } = group;
  let labels;
  let heading;
  if (id === "taijutsu") {
    heading = techniqueCategory;
    const observed = [...new Set(kata.map(heading))];
    labels = [...TECHNIQUE_ORDER.filter(label => observed.includes(label)),
      ...observed.filter(label => !TECHNIQUE_ORDER.includes(label)).sort((a, b) => a.localeCompare(b, "ko"))];
  } else if (id === "sword-knife") {
    heading = item => item.categoryId === "tanto" ? "단도 뺏기"
      : item.nameKo.startsWith("검 뺏기") ? "검 뺏기" : "검술·검 아와세";
    labels = ["단도 뺏기", "검 뺏기", "검술·검 아와세"];
  } else if (id === "jo") {
    heading = item => item.nameKo.startsWith("장 뺏기") ? "장 뺏기" : "장술·장 아와세";
    labels = ["장 뺏기", "장술·장 아와세"];
  } else {
    heading = () => "2인 잡기";
    labels = ["2인 잡기"];
  }
  return labels.map((label, index) => ({
    id: `${id}-${index}`,
    label,
    kata: kata.filter(item => heading(item) === label)
  })).filter(section => section.kata.length > 0);
}

export function kataVideoActions(links) {
  const genericCount = links.filter((link) => link.label !== "오모테" && link.label !== "우라").length;
  let genericIndex = 0;
  return links.map((link) => {
    if (link.label === "오모테" || link.label === "우라") {
      return { label: `영상(${link.label})`, url: link.url };
    }
    genericIndex += 1;
    return { label: genericCount === 1 ? "영상" : `영상 ${genericIndex}`, url: link.url };
  });
}

export function kataExamBadges(kata) {
  const labels = getKataExamLabels(kata);
  return labels.length ? labels.map((label) => ({
    label,
    anchor: label === "유단자용" ? "exam-dan" : `exam-grade-${label.slice(0, -1)}`
  })) : [{ label: "심사표 외", anchor: null }];
}
