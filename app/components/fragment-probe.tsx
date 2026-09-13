"use client";

import { useMemo, useSyncExternalStore } from "react";

import {
  parseSessionHash,
  type SessionParseResult
} from "../session-share.mjs";

function subscribeToHashChange(onStoreChange: () => void) {
  window.addEventListener("hashchange", onStoreChange);
  return () => window.removeEventListener("hashchange", onStoreChange);
}

function getHashSnapshot() {
  return window.location.hash;
}

function getServerHashSnapshot() {
  return "";
}

export function FragmentProbe() {
  const hash = useSyncExternalStore(
    subscribeToHashChange,
    getHashSnapshot,
    getServerHashSnapshot
  );
  const result: SessionParseResult = useMemo(() => parseSessionHash(hash), [hash]);

  if (!result.ok) {
    return (
      <section aria-labelledby="session-preview-title">
        <h2 id="session-preview-title">Session Share Payload v1 미리보기</h2>
        <p className="status-warn" role="status">{result.message}</p>
        <p className="small">오류 코드: {result.code}</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="session-preview-title">
      <h2 id="session-preview-title">Session Share Payload v1 미리보기</h2>
      <dl className="diag-grid">
        <dt>수업번호</dt>
        <dd>{result.payload.sessionNo}</dd>
        <dt>날짜</dt>
        <dd>{result.payload.date}</dd>
        <dt>수련내용</dt>
        <dd>{result.payload.kata.length}개</dd>
      </dl>

      <ul className="preview-list">
        {result.payload.kata.map((kata, index) => (
          <li key={kata.id + "-" + index}>
            <strong>{kata.name}</strong>
            <span className="small">ID: {kata.id}</span>
          </li>
        ))}
      </ul>

      {result.warnings.map((warning) => (
        <p className="status-warn" key={warning}>{warning}</p>
      ))}

      <p className="status-ok">
        현재는 미리보기 단계이며 수련일지에는 저장되지 않습니다.
      </p>
      <p className="small">
        Canonical kata catalog 비교는 확정 reference data 추가 후 Phase 2 후속으로 진행합니다.
      </p>
    </section>
  );
}
