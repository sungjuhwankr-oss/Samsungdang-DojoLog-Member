"use client";

import { useEffect, useMemo, useState } from "react";

import kataCatalog from "../../reference/kata-catalog.v1.json";
import type { PromotionRecord } from "../member-data.mjs";
import {
  createTrainingAnalysis,
  getNextKataEncouragement,
  getProgressEncouragement,
  groupKataByGrade,
  type KataScope
} from "../training-progress.mjs";
import type { HydratedTrainingSession } from "../training-records.mjs";
import { listTrainingSessions } from "../training-store";

type LoadStatus = "loading" | "ready" | "error";

function CoverageSummary({ scope }: { scope: KataScope }) {
  if (scope.total === 0) return <span>카타 없음</span>;
  return (
    <span>
      {scope.total}개 중 {scope.practiced}개 수련 · {scope.unrecorded}개 앱 기록 없음
    </span>
  );
}

function KataScopeDetails({
  scopeId,
  title,
  scope,
  emptyMessage,
  open = false
}: {
  scopeId: string;
  title: string;
  scope: KataScope;
  emptyMessage: string;
  open?: boolean;
}) {
  const groups = groupKataByGrade(scope);

  return (
    <details className="kata-scope" open={open}>
      <summary>
        <strong>{title}</strong>
        <CoverageSummary scope={scope} />
      </summary>
      {scope.total === 0 ? (
        <p className="small">{emptyMessage}</p>
      ) : (
        <div className="kata-grade-groups">
          {groups.map((group) => (
            <section key={group.grade} aria-labelledby={`${scopeId}-grade-${group.grade}`}>
              <h3 id={`${scopeId}-grade-${group.grade}`}>
                {group.grade}급 · {group.practiced}/{group.total}개 수련
              </h3>
              <ul className="kata-count-list">
                {group.entries.map((entry) => (
                  <li key={entry.id}>
                    <span>{entry.nameKo}</span>
                    <strong className={entry.count === 0 ? "count-zero" : undefined}>
                      {entry.count}회
                    </strong>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </details>
  );
}

export function TrainingProgressPanel({
  promotions,
  memberDataStatus
}: {
  promotions: PromotionRecord[];
  memberDataStatus: LoadStatus;
}) {
  const [sessions, setSessions] = useState<HydratedTrainingSession[]>([]);
  const [sessionStatus, setSessionStatus] = useState<LoadStatus>("loading");

  useEffect(() => {
    let active = true;
    listTrainingSessions().then(
      (records) => {
        if (!active) return;
        setSessions(records);
        setSessionStatus("ready");
      },
      () => {
        if (active) setSessionStatus("error");
      }
    );
    return () => {
      active = false;
    };
  }, []);

  const analysis = useMemo(
    () => createTrainingAnalysis(promotions, sessions, kataCatalog),
    [promotions, sessions]
  );
  const progressMessage = analysis.progress
    ? getProgressEncouragement(analysis.progress)
    : null;
  const nextKataMessage = getNextKataEncouragement(analysis.exam.nextNew);
  const ready = memberDataStatus === "ready" && sessionStatus === "ready";

  return (
    <section className="panel" aria-labelledby="training-progress-title">
      <h2 id="training-progress-title">수련 진행과 심사 카타</h2>

      {(memberDataStatus === "loading" || sessionStatus === "loading") && (
        <p>수련 분석 데이터를 확인하는 중입니다.</p>
      )}
      {(memberDataStatus === "error" || sessionStatus === "error") && (
        <p className="status-warn" role="status">
          저장된 승급이력 또는 수련기록을 읽을 수 없어 분석을 표시할 수 없습니다.
        </p>
      )}

      {ready && (
        <>
          <div className="progress-heading">
            <span>{analysis.currentRank?.label ?? "무급"}</span>
            <span aria-hidden="true">→</span>
            <strong>{analysis.progress?.targetLabel ?? "유단자 수련"}</strong>
          </div>

          <div className="training-day-grid">
            <div>
              <span>입문 후 앱 기록 수련일수</span>
              <strong>{analysis.totalTrainingDays}일</strong>
            </div>
            <div>
              <span>
                {analysis.currentRank
                  ? "현급 취득 후 앱 기록 수련"
                  : "무급 앱 기록 수련"}
              </span>
              <strong>
                {analysis.progress?.values
                  ? `${analysis.progress.values.actual} / ${analysis.progress.values.required}회`
                  : analysis.progress
                    ? "현급 취득일 미입력"
                    : "급수 진행도 대상 아님"}
              </strong>
            </div>
          </div>

          {analysis.progress?.values && (
            <>
              <div
                className="progress-track"
                role="progressbar"
                aria-label={`${analysis.progress.targetLabel} 기본 수련횟수 진행도`}
                aria-valuemin={0}
                aria-valuemax={analysis.progress.values.required}
                aria-valuenow={Math.min(
                  analysis.progress.values.actual,
                  analysis.progress.values.required
                )}
                aria-valuetext={`${analysis.progress.values.actual} / ${analysis.progress.values.required}회`}
              >
                <span style={{ width: `${analysis.progress.values.visualPercent}%` }} />
              </div>
              <p className="progress-note">
                {analysis.progress.values.thresholdMet
                  ? "기본 수련횟수 기준을 충족했습니다."
                  : `기본 수련횟수 기준까지 ${analysis.progress.values.remaining}회`}
              </p>
            </>
          )}

          {analysis.progress && analysis.progress.values === null && (
            <p className="status-warn">
              현급 취득일 미입력으로 현급 수련횟수와 남은 횟수를 계산하지 않습니다.
            </p>
          )}

          {!analysis.progress && analysis.currentRank?.rankType === "dan" && (
            <p className="small">
              유단자의 기간·횟수·연령을 함께 다루는 승단 진행도는 이번 화면에서 계산하지 않습니다.
            </p>
          )}

          {!analysis.progress && analysis.currentRank?.rankType !== "dan" && (
            <p className="status-warn">
              현재 승급이력의 급수는 기본 수련횟수 reference 범위에서 확인되지 않습니다.
            </p>
          )}

          {sessions.length === 0 && (
            <p className="small">
              수련기록을 내 수련일지에 추가하면 앱 기록 기준의 횟수와 카타 분석이 표시됩니다.
            </p>
          )}

          {progressMessage && <p className="encouragement">{progressMessage}</p>}
          {nextKataMessage && <p className="encouragement">{nextKataMessage}</p>}

          <p className="small discretion-note">
            표시된 횟수는 기본 수련횟수 기준입니다. 실제 심사 응시 시기는 지도자의 판단에
            따라 달라질 수 있습니다.
          </p>

          <div className="scope-list">
            <KataScopeDetails
              scopeId="current-exam-scope"
              title={analysis.exam.currentLabel
                ? `${analysis.exam.currentLabel} 지금까지 배운 누적 심사범위`
                : "지금까지 배운 급수 누적 심사범위"}
              scope={analysis.exam.current}
              emptyMessage="무급에는 취득한 급수의 누적 심사범위가 아직 없습니다."
            />

            {analysis.progress && (
              <KataScopeDetails
                scopeId="next-new-exam-scope"
                title={`${analysis.progress.targetLabel}에서 새로 추가되는 카타`}
                scope={analysis.exam.nextNew}
                emptyMessage="현재 canonical 급수 심사표에서 이 목표에 새로 추가되는 카타는 없습니다."
                open
              />
            )}

            {analysis.progress && (
              <KataScopeDetails
                scopeId="next-cumulative-exam-scope"
                title={`${analysis.exam.nextCumulativeLabel ?? "다음"} 다음 심사 전체 누적범위`}
                scope={analysis.exam.nextCumulative}
                emptyMessage="현재 급수 reference에서 계산할 수 있는 다음 심사 누적범위가 없습니다."
              />
            )}

            <KataScopeDetails
              scopeId="all-exam-scope"
              title="9급~1급 전체 심사 카타 분석"
              scope={analysis.exam.all}
              emptyMessage="canonical 심사 카타 reference를 확인할 수 없습니다."
            />
          </div>

          <p className="small">
            카타 수련횟수는 Kata.id 기준으로 한 수업에서 같은 카타를 한 번만 집계합니다.
            이름이 다른 snapshot이나 현재 카탈로그 밖 기록을 임의로 다른 카타에 합치지 않습니다.
          </p>
        </>
      )}
    </section>
  );
}
