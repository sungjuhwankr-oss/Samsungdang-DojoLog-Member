"use client";

import { useEffect, useState } from "react";

import type { SpecialTrainingHistoryView } from "../special-training-records.mjs";
import {
  listVerifiedSpecialTrainingHistory,
  SPECIAL_TRAINING_CHANGED_EVENT
} from "../special-training-store.mjs";

export function SpecialTrainingHistory() {
  const [history, setHistory] = useState<SpecialTrainingHistoryView[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let active = true;
    const reload = () => {
      listVerifiedSpecialTrainingHistory().then(
        (records) => {
          if (!active) return;
          setHistory(records);
          setStatus("ready");
        },
        () => {
          if (active) setStatus("error");
        }
      );
    };
    reload();
    window.addEventListener(SPECIAL_TRAINING_CHANGED_EVENT, reload);
    return () => {
      active = false;
      window.removeEventListener(SPECIAL_TRAINING_CHANGED_EVENT, reload);
    };
  }, []);

  return <section className="panel" aria-labelledby="special-training-history-title">
    <h2 id="special-training-history-title">삼성당 특별수련 이력</h2>
    {status === "loading" && <p role="status">저장된 이력을 확인하고 있습니다.</p>}
    {status === "error" && <p className="status-warn" role="alert">저장된 이력의 서명 또는 구조를 확인할 수 없습니다.</p>}
    {status === "ready" && history.length === 0 && <p>등록된 특별수련 이력이 없습니다.</p>}
    {status === "ready" && history.length > 0 && <ol className="special-training-list">
      {history.map((item) => <li key={item.eventId}>
        <strong>{item.title}</strong>
        <span>{item.endDate ? `${item.startDate} ~ ${item.endDate}` : item.startDate}</span>
        <span>{item.instructor}</span>
      </li>)}
    </ol>}
  </section>;
}
