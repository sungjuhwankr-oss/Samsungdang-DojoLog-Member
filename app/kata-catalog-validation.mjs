export const KATA_CATALOG_STATUS = Object.freeze({
  KNOWN_MATCH: "KNOWN_MATCH",
  UNKNOWN_ID: "UNKNOWN_ID",
  KNOWN_ID_NAME_MISMATCH: "KNOWN_ID_NAME_MISMATCH"
});

export function validateSessionKataCatalog(kataSnapshots, catalog) {
  const canonicalNamesById = new Map(
    catalog.kata.map((kata) => [kata.id, kata.nameKo])
  );

  return kataSnapshots.map((snapshot, index) => {
    const canonicalName = canonicalNamesById.get(snapshot.id);

    if (canonicalName === undefined) {
      return {
        index,
        status: KATA_CATALOG_STATUS.UNKNOWN_ID,
        id: snapshot.id,
        name: snapshot.name,
        canonicalName: null
      };
    }

    return {
      index,
      status: canonicalName === snapshot.name
        ? KATA_CATALOG_STATUS.KNOWN_MATCH
        : KATA_CATALOG_STATUS.KNOWN_ID_NAME_MISMATCH,
      id: snapshot.id,
      name: snapshot.name,
      canonicalName
    };
  });
}
