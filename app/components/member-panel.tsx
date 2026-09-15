"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { deriveCurrentRank } from "../member-data.mjs";
import type { MemberProfile, PromotionRecord } from "../member-data.mjs";
import { TrainingProgressPanel } from "./training-progress-panel";
import {
  addPromotion,
  getMemberProfile,
  listPromotionHistory,
  saveMemberProfile
} from "../training-store";

const emptyProfile: MemberProfile = {
  id: "self",
  name: null,
  memberNo: null,
  joinDate: null
};

export function MemberPanel() {
  const [profile, setProfile] = useState<MemberProfile>(emptyProfile);
  const [promotions, setPromotions] = useState<PromotionRecord[]>([]);
  const [profileStatus, setProfileStatus] = useState("");
  const [promotionStatus, setPromotionStatus] = useState("");
  const [rankType, setRankType] = useState<"kyu" | "dan">("kyu");
  const [rankValue, setRankValue] = useState("");
  const [rankDate, setRankDate] = useState("");
  const [dateUnknown, setDateUnknown] = useState(false);
  const [dataStatus, setDataStatus] = useState<"loading" | "ready" | "error">("loading");
  const currentRank = useMemo(() => deriveCurrentRank(promotions), [promotions]);

  useEffect(() => {
    let active = true;
    Promise.all([getMemberProfile(), listPromotionHistory()]).then(
      ([savedProfile, savedPromotions]) => {
        if (!active) return;
        if (savedProfile) setProfile(savedProfile);
        setPromotions(savedPromotions);
        setDataStatus("ready");
      },
      () => {
        if (active) {
          setDataStatus("error");
          setProfileStatus("회원 데이터를 읽을 수 없습니다.");
        }
      }
    );
    return () => {
      active = false;
    };
  }, []);

  async function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileStatus("");
    try {
      const saved = await saveMemberProfile({
        name: profile.name,
        memberNo: profile.memberNo,
        joinDate: profile.joinDate
      });
      setProfile(saved);
      setProfileStatus("내 정보를 저장했습니다.");
    } catch {
      setProfileStatus("내 정보를 저장할 수 없습니다.");
    }
  }

  async function submitPromotion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPromotionStatus("");
    try {
      const promotion = await addPromotion({
        rankType,
        rankValue: Number(rankValue),
        date: dateUnknown ? null : (rankDate || null)
      });
      setPromotions((current) => [...current, promotion]);
      setPromotionStatus("승급이력을 추가했습니다.");
      setRankDate("");
      setDateUnknown(false);
    } catch {
      setPromotionStatus("승급이력을 추가할 수 없습니다.");
    }
  }

  return (
    <>
      <section className="panel" aria-labelledby="member-profile-title">
        <h2 id="member-profile-title">내 정보</h2>
        <form className="compact-form" onSubmit={submitProfile}>
          <label>
            이름
            <input
              value={profile.name ?? ""}
              onChange={(event) => setProfile({ ...profile, name: event.target.value || null })}
              maxLength={80}
            />
          </label>
          <label>
            회원번호
            <input
              value={profile.memberNo ?? ""}
              onChange={(event) => setProfile({ ...profile, memberNo: event.target.value || null })}
              maxLength={80}
            />
          </label>
          <label>
            입문일
            <input
              type="date"
              value={profile.joinDate ?? ""}
              onChange={(event) => setProfile({ ...profile, joinDate: event.target.value || null })}
            />
          </label>
          <button className="cta" type="submit">내 정보 저장</button>
        </form>
        {profileStatus && <p role="status">{profileStatus}</p>}
      </section>

      <section className="panel" aria-labelledby="promotion-title">
        <h2 id="promotion-title">승급이력</h2>
        <p><strong>현재 급/단:</strong> {currentRank?.label ?? "무급 (승급이력 없음)"}</p>
        <form className="compact-form" onSubmit={submitPromotion}>
          <label>
            구분
            <select value={rankType} onChange={(event) => setRankType(event.target.value as "kyu" | "dan")}>
              <option value="kyu">급</option>
              <option value="dan">단</option>
            </select>
          </label>
          <label>
            급/단 숫자
            <input
              type="number"
              min="1"
              step="1"
              required
              value={rankValue}
              onChange={(event) => setRankValue(event.target.value)}
            />
          </label>
          <label>
            날짜
            <input
              type="date"
              disabled={dateUnknown}
              value={rankDate}
              onChange={(event) => setRankDate(event.target.value)}
            />
          </label>
          <label className="inline-check">
            <input
              type="checkbox"
              checked={dateUnknown}
              onChange={(event) => setDateUnknown(event.target.checked)}
            />
            날짜 미상
          </label>
          <button className="cta" type="submit">급/단 추가</button>
        </form>
        {promotionStatus && <p role="status">{promotionStatus}</p>}
        {promotions.length > 0 && (
          <ol className="promotion-list">
            {promotions.map((promotion) => (
              <li key={promotion.id}>
                {promotion.rankValue}{promotion.rankType === "kyu" ? "급" : "단"}
                <span>{promotion.date ?? "날짜 미상"}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <TrainingProgressPanel promotions={promotions} memberDataStatus={dataStatus} />
    </>
  );
}
