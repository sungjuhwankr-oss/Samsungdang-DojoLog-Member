export const KATA_CATEGORIES = Object.freeze([
  Object.freeze({ id: "taijutsu", label: "기본 체술" }),
  Object.freeze({ id: "tanto", label: "단도" }),
  Object.freeze({ id: "ken", label: "검" }),
  Object.freeze({ id: "jo", label: "장" }),
  Object.freeze({ id: "multi-other", label: "다인·기타" })
]);

export function findCurrentKata(catalog, id) {
  if (typeof id !== "string") return null;
  return catalog.kata.find((kata) => kata.id === id) ?? null;
}

export function getCurrentKataPresentation(catalog, id) {
  const kata = findCurrentKata(catalog, id);
  if (!kata) return Object.freeze({ status: "unknown", kata: null, links: Object.freeze([]) });
  const links = Object.freeze(kata.links.map((link) => Object.freeze({ ...link })));
  return Object.freeze({
    status: links.length > 0 ? "video" : "no-video",
    kata,
    links
  });
}

export function getKataExamLabels(kata) {
  const entries = Array.isArray(kata?.examEntries) ? kata.examEntries : [];
  const kyu = entries
    .filter((entry) => entry.track === "kyu")
    .map((entry) => entry.grade)
    .filter((grade) => Number.isInteger(grade) && grade >= 1 && grade <= 9)
    .sort((left, right) => right - left)
    .map((grade) => `${grade}급`);
  if (kyu.length > 0) return kyu;
  return entries.some((entry) => entry.track === "dan") ? ["유단자용"] : [];
}

export function groupKataByCategory(catalog) {
  return KATA_CATEGORIES.map((category) => ({
    ...category,
    kata: catalog.kata.filter((kata) => kata.categoryId === category.id)
  }));
}

export function createExamTable(catalog) {
  const kyu = [];
  for (let grade = 9; grade >= 1; grade -= 1) {
    kyu.push({
      grade,
      kata: catalog.kata.filter((item) => item.examEntries.some(
        (entry) => entry.track === "kyu" && entry.grade === grade
      ))
    });
  }
  return {
    kyu,
    dan: catalog.kata.filter((item) => item.examEntries.some((entry) => entry.track === "dan"))
  };
}

export function getBeginnerVideoLevel(title) {
  if (title.startsWith("■")) return "section";
  if (/^\d+-\d+\./.test(title)) return "detail";
  return "item";
}
