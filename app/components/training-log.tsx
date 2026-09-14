"use client";

import { useEffect, useState } from "react";

import {
  listTrainingSessions,
  TRAINING_DB_NAME,
  TRAINING_DB_VERSION
} from "../training-store";
import type { HydratedTrainingSession } from "../training-records.mjs";

type LoadState =
  | { status: "loading"; records: HydratedTrainingSession[] }
  | { status: "ready"; records: HydratedTrainingSession[] }
  | { status: "error"; records: HydratedTrainingSession[] };

function initialOrigin() {
  return typeof window === "undefined" ? "" : window.location.origin;
}

function initialDisplayMode() {
  if (typeof window === "undefined") return "browser";
  return window.matchMedia("(display-mode: standalone)").matches
    ? "standalone"
    : "browser";
}

export function TrainingLog() {
  const [state, setState] = useState<LoadState>({
    status: "loading",
    records: []
  });
  const [origin] = useState(initialOrigin);
  const [displayMode] = useState(initialDisplayMode);

  useEffect(() => {
    let active = true;

    listTrainingSessions().then(
      (records) => {
        if (active) setState({ status: "ready", records });
      },
      () => {
        if (active) setState({ status: "error", records: [] });
      }
    );

    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="panel" aria-labelledby="training-log-title">
      <h2 id="training-log-title">내 수련기록</h2>

      {state.status === "loading" && <p>저장된 기록을 확인하는 중입니다.</p>}
      {state.status === "error" && (
        <p className="status-warn" role="status">
          IndexedDB에서 수련기록을 읽을 수 없습니다.
        </p>
      )}
      {state.status === "ready" && state.records.length === 0 && (
        <p>저장된 수련기록이 없습니다.</p>
      )}

      {state.records.length > 0 && (
        <ul className="session-list">
          {state.records.map((record) => (
            <li key={record.dojo + "-" + record.sessionNo}>
              <strong>수업 {record.sessionNo}</strong>
              <span>{record.date}</span>
              <span>수련내용 {record.kata.length}개</span>
              <ul>
                {record.kata.map((kata) => (
                  <li key={kata.id + "-" + kata.order}>{kata.name}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      <dl className="diag-grid storage-diagnostic">
        <dt>IndexedDB</dt>
        <dd>{typeof indexedDB === "undefined" ? "unavailable" : "available"}</dd>
        <dt>database</dt>
        <dd>{TRAINING_DB_NAME} v{TRAINING_DB_VERSION}</dd>
        <dt>origin</dt>
        <dd>{origin || "server render"}</dd>
        <dt>display-mode</dt>
        <dd>{displayMode}</dd>
      </dl>
      <p className="small">
        동일 origin의 Chrome browser와 설치 PWA가 이 IndexedDB를 공유하는지는
        Fold8 실기 순서로 검증합니다.
      </p>
    </section>
  );
}
