"use client";

import { useEffect, useMemo, useState } from "react";

import { deriveCurrentRank } from "../member-data.mjs";
import type { PromotionRecord } from "../member-data.mjs";
import type { VerifiedMembershipPayload } from "../credential/membership-verifier.mjs";
import { loadStoredMembershipVerification } from "../membership-store.mjs";
import { listPromotionHistory } from "../training-store";

export function MembershipCard() {
  const [identity, setIdentity] = useState<VerifiedMembershipPayload | null>(null);
  const [promotions, setPromotions] = useState<PromotionRecord[]>([]);
  const [failed, setFailed] = useState(false);
  const currentRank = useMemo(() => deriveCurrentRank(promotions), [promotions]);

  useEffect(() => {
    let active = true;
    Promise.all([loadStoredMembershipVerification(), listPromotionHistory()]).then(
      ([verification, savedPromotions]) => {
        if (!active) return;
        if (!verification?.valid || !verification.verifiedPayload) {
          setFailed(true);
          return;
        }
        setIdentity(verification.verifiedPayload);
        setPromotions(savedPromotions);
      },
      () => {
        if (active) setFailed(true);
      }
    );
    return () => {
      active = false;
    };
  }, []);

  if (failed) return null;
  if (!identity) return <section className="panel"><p role="status">디지털 회원증을 확인하고 있습니다.</p></section>;

  return (
    <section className="panel membership-card" aria-labelledby="membership-card-title">
      <p className="small">아이키도 삼성당 발급정보</p>
      <h2 id="membership-card-title">디지털 회원증</h2>
      <dl className="diag-grid">
        <dt>성명</dt><dd>{identity.name}</dd>
        <dt>회원번호</dt><dd>{identity.memberId}</dd>
        <dt>입회일</dt><dd>{identity.joinedAt}</dd>
        <dt>현재 확인된 단급</dt><dd>{currentRank?.label ?? "확인된 이력 없음"}</dd>
        <dt>해당 단급 날짜</dt><dd>{currentRank ? (currentRank.date ?? "확인된 날짜 없음") : "확인된 이력 없음"}</dd>
      </dl>
      <p className="small">이 화면은 법적 신원증명 또는 실시간 활동회원 증명이 아닙니다.</p>
    </section>
  );
}
