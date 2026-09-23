import assert from "node:assert/strict";
import test from "node:test";

import {
  advanceOneRank,
  assessPromotionCredential,
  normalizePromotionRecord,
  rankOrdinal
} from "../app/promotion-records.mjs";

const membership = {
  valid: true,
  credentialType: "membership",
  verifiedPayload: { name: "테스트", memberId: "ASD-000", joinedAt: "2026-01-01" }
};
const verification = (payload, id = "c1_test") => ({
  valid: true,
  credentialType: "promotion",
  credentialId: id,
  keyId: "k1_test",
  verifiedPayload: payload,
  envelopeJson: "{}"
});
const history = (rankType, rankValue) => rankType ? [{
  id: "legacy", rankType, rankValue, date: "2026-01-01", order: 1
}] : [];

test("advance-one implements the complete kyu progression table", () => {
  assert.deepEqual(advanceOneRank(null), { rankType: "kyu", rankValue: 9 });
  for (let value = 9; value >= 2; value -= 1) {
    assert.deepEqual(advanceOneRank({ rankType: "kyu", rankValue: value }), { rankType: "kyu", rankValue: value - 1 });
  }
  assert.deepEqual(advanceOneRank({ rankType: "kyu", rankValue: 1 }), { rankType: "dan", rankValue: 1 });
});

test("advance-one implements N단 to N+1단", () => {
  for (const value of [1, 2, 5, 100]) {
    assert.deepEqual(advanceOneRank({ rankType: "dan", rankValue: value }), { rankType: "dan", rankValue: value + 1 });
  }
});

test("rank ordinals are monotonic from unranked through dan", () => {
  assert.equal(rankOrdinal(null), 0);
  assert.equal(rankOrdinal({ rankType: "kyu", rankValue: 9 }), 1);
  assert.equal(rankOrdinal({ rankType: "kyu", rankValue: 1 }), 9);
  assert.equal(rankOrdinal({ rankType: "dan", rankValue: 1 }), 10);
  assert.equal(rankOrdinal({ rankType: "dan", rankValue: 6 }), 15);
});

test("target higher succeeds while same and lower targets are rejected", () => {
  const make = (targetRank) => verification({ eventType: "promoted", examDate: "2026-02-01", mode: "target", targetRank });
  assert.equal(assessPromotionCredential(make({ rankType: "kyu", rankValue: 5 }), membership, history("kyu", 7)).canConfirm, true);
  assert.equal(assessPromotionCredential(make({ rankType: "kyu", rankValue: 7 }), membership, history("kyu", 7)).reason, "target-conflict");
  assert.equal(assessPromotionCredential(make({ rankType: "kyu", rankValue: 8 }), membership, history("kyu", 7)).reason, "target-conflict");
});

test("recognized-at-entry binds the verified Membership memberId", () => {
  const base = { eventType: "recognized-at-entry", memberId: "ASD-000", mode: "target", rankDate: null, recognizedAt: "2026-02-01", targetRank: { rankType: "kyu", rankValue: 5 } };
  assert.equal(assessPromotionCredential(verification(base), membership, []).canConfirm, true);
  assert.equal(assessPromotionCredential(verification({ ...base, memberId: "ASD-999" }), membership, []).reason, "member-mismatch");
});

test("legacy promotion records normalize at read time without changing the input", () => {
  const legacy = { id: "p1", rankType: "kyu", rankValue: 8, date: null, order: 1 };
  assert.deepEqual(normalizePromotionRecord(legacy), { ...legacy, source: "self", eventType: "self-recorded" });
  assert.equal("source" in legacy, false);
});
