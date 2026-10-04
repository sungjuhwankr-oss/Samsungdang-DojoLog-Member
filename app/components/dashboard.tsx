"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import kataCatalog from "../../reference/kata-catalog.v2.json";
import { EVENTS_CHANGED_EVENT, loadEventTrainingData } from "../event-store.mjs";
import { loadStoredMembershipVerification } from "../membership-store.mjs";
import { deriveCurrentRankWithOnboarding } from "../member-data.mjs";
import { loadActiveOnboardingState, ONBOARDING_CHANGED_EVENT } from "../onboarding-store.mjs";
import type { ActiveOnboardingState } from "../onboarding-store.mjs";
import type { PromotionRecord } from "../member-data.mjs";
import type { SpecialTrainingHistoryView } from "../special-training-records.mjs";
import { listVerifiedSpecialTrainingHistory } from "../special-training-store.mjs";
import { createTrainingAnalysis } from "../training-progress.mjs";
import type { HydratedTrainingSession } from "../training-records.mjs";
import { listPromotionHistory, listTrainingSessions, TRAINING_DATA_CHANGED_EVENT } from "../training-store";
import { useMembershipFeatureGate } from "./samsungdang-feature-boundary";

type DashboardData = {
  sessions: HydratedTrainingSession[];
  promotions: PromotionRecord[];
  special: SpecialTrainingHistoryView[];
  memberId: string | null;
  onboarding: ActiveOnboardingState | null;
  eventSessions: { special: Array<{ date: string }>; external: Array<{ date: string }> };
};

const emptyData: DashboardData = {
  sessions: [], promotions: [], special: [], memberId: null, onboarding: null,
  eventSessions: { special: [], external: [] }
};

function sessionTitle(session: HydratedTrainingSession) {
  return session.source === "shared"
    ? `공유수업 ${session.sessionNo}`
    : `개인수련 · 기록 ${session.sessionNo}`;
}

export function Dashboard() {
  const gate = useMembershipFeatureGate();
  const isMember = gate.hasValidMembershipCredential;
  const [data, setData] = useState<DashboardData>(emptyData);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let active = true;
    const reload = () => {
      Promise.all([
        listTrainingSessions(),
        listPromotionHistory(),
        listVerifiedSpecialTrainingHistory(),
        loadStoredMembershipVerification(),
        loadActiveOnboardingState(),
        loadEventTrainingData()
      ]).then(
        ([sessions, promotions, special, membership, onboarding, eventSessions]) => {
          if (!active) return;
          setData({
            sessions,
            promotions,
            special,
            memberId: membership?.valid ? membership.verifiedPayload?.memberId ?? null : null,
            onboarding,
            eventSessions
          });
          setStatus("ready");
        },
        () => {
          if (active) setStatus("error");
        }
      );
    };
    reload();
    window.addEventListener(TRAINING_DATA_CHANGED_EVENT, reload);
    window.addEventListener(ONBOARDING_CHANGED_EVENT, reload);
    window.addEventListener(EVENTS_CHANGED_EVENT, reload);
    return () => {
      active = false;
      window.removeEventListener(TRAINING_DATA_CHANGED_EVENT, reload);
      window.removeEventListener(ONBOARDING_CHANGED_EVENT, reload);
      window.removeEventListener(EVENTS_CHANGED_EVENT, reload);
    };
  }, []);

  const analysis = useMemo(
    () => createTrainingAnalysis(data.promotions, data.sessions, kataCatalog, data.onboarding, data.eventSessions),
    [data.eventSessions, data.onboarding, data.promotions, data.sessions]
  );
  const currentRank = useMemo(() => deriveCurrentRankWithOnboarding(data.promotions, data.onboarding), [data.onboarding, data.promotions]);
  const latestSession = data.sessions[0] ?? null;
  const latestPromotion = data.promotions.at(-1) ?? null;
  const latestSpecial = data.special[0] ?? null;

  return (
    <>
      <section className="dashboard-summary" aria-labelledby="dashboard-count-title">
        <div className="metric-card">
          <span id="dashboard-count-title">전체 수련횟수</span>
          <strong>{status === "ready" ? `${analysis.trainingCounts.total}회` : "—"}</strong>
          <small>
            일반 {analysis.trainingCounts.sources.general} · 삼성당 특별수련 {analysis.trainingCounts.sources.special} · 외부행사 {analysis.trainingCounts.sources.external}
          </small>
        </div>
        {isMember && (
          <div className="metric-card">
            <span>현재 단급</span>
            <strong>{currentRank?.label ?? "확인된 이력 없음"}</strong>
            <small>{data.memberId ?? "회원정보 확인 중"}</small>
          </div>
        )}
      </section>

      {status === "error" && <p className="status-warn" role="status">저장된 요약 정보를 읽을 수 없습니다.</p>}

      <section className="dashboard-grid" aria-label="요약과 바로가기">
        <Link className="dashboard-card" href="/journal/">
          <span>최근 일반 수련</span>
          <strong>{latestSession ? sessionTitle(latestSession) : "기록 없음"}</strong>
          <small>{latestSession?.date ?? "수련일지에서 기록할 수 있습니다."}</small>
        </Link>
        <Link className="dashboard-card" href="/kata/">
          <span>카타</span><strong>카타 자료실 · 삼성당 심사표</strong><small>97개 canonical Kata</small>
        </Link>
        <Link className="dashboard-card" href="/beginner-videos/">
          <span>초심자 동영상</span><strong>기본 동작과 대인 기술</strong><small>53개 영상 항목</small>
        </Link>
        <Link className="dashboard-card" href="/events/">
          <span>행사</span><strong>{latestSpecial ? latestSpecial.title : "특별수련·외부행사"}</strong>
          <small>{latestSpecial ? latestSpecial.startDate : "특별수련·외부행사 기록"}</small>
        </Link>
        <Link className="dashboard-card" href="/backup/">
          <span>백업</span><strong>Backup v1</strong><small>내보내기와 복원</small>
        </Link>

        {isMember && (
          <>
            <Link className="dashboard-card member-card-link" href="/membership-card/">
              <span>회원증</span><strong>디지털 회원증</strong><small>검증된 Membership Credential</small>
            </Link>
            <Link className="dashboard-card member-card-link" href="/promotion-history/">
              <span>현급 수련횟수</span>
              <strong>{analysis.progress?.values
                ? `${analysis.progress.values.actual} / ${analysis.progress.values.required}회`
                : "산정 정보 없음"}</strong>
              <small>{latestPromotion
                ? `최근 이력 ${latestPromotion.rankValue}${latestPromotion.rankType === "kyu" ? "급" : "단"}`
                : "등록된 승단급 이력 없음"}</small>
            </Link>
          </>
        )}
      </section>
      <p className="small dashboard-note">기존 특별수련 v1은 session 정보가 없어 전체 수련횟수에 합산하지 않습니다.</p>
    </>
  );
}
