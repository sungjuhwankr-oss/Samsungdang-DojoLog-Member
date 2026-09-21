"use client";

import { useEffect, useMemo, useState } from "react";

import { createTrainingSummary } from "../training-summary.mjs";
import type { HydratedTrainingSession } from "../training-records.mjs";
import { listTrainingSessions, TRAINING_DATA_CHANGED_EVENT } from "../training-store";

type LoadStatus = "loading" | "ready" | "error";

export function TrainingSummary() {
  const [sessions, setSessions] = useState<HydratedTrainingSession[]>([]);
  const [status, setStatus] = useState<LoadStatus>("loading");

  useEffect(() => {
    let active = true;
    const reload = () => {
      listTrainingSessions().then(
        (value) => {
          if (!active) return;
          setSessions(value);
          setStatus("ready");
        },
        () => {
          if (active) setStatus("error");
        }
      );
    };

    reload();
    window.addEventListener(TRAINING_DATA_CHANGED_EVENT, reload);
    return () => {
      active = false;
      window.removeEventListener(TRAINING_DATA_CHANGED_EVENT, reload);
    };
  }, []);

  const summary = useMemo(() => createTrainingSummary(sessions), [sessions]);

  return (
    <section className="panel" aria-labelledby="training-summary-title">
      <h2 id="training-summary-title">수련 기록 요약</h2>
      {status === "loading" && <p>수련기록을 확인하는 중입니다.</p>}
      {status === "error" && <p className="status-warn" role="status">수련기록을 읽을 수 없습니다.</p>}
      {status === "ready" && (
        <>
          <div className="training-day-grid">
            <div><span>앱 기록 수련일수</span><strong>{summary.trainingDays}일</strong></div>
            <div><span>앱 기록 수련횟수</span><strong>{summary.trainingSessions}회</strong></div>
          </div>
          {summary.kata.length === 0 ? (
            <p className="small">카타 수련기록이 없습니다.</p>
          ) : (
            <ul className="kata-count-list">
              {summary.kata.map((kata) => (
                <li key={kata.id}><span>{kata.name}</span><strong>{kata.count}회</strong></li>
              ))}
            </ul>
          )}
          <p className="small">카타 수련횟수는 Kata.id 기준으로 한 수련일지에서 한 번만 집계합니다.</p>
        </>
      )}
    </section>
  );
}
