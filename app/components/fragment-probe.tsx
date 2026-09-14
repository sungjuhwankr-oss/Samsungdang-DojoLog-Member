"use client";

import { useMemo, useState, useSyncExternalStore } from "react";

import {
  parseSessionHash,
  type SessionParseResult,
  type SessionPayload
} from "../session-share.mjs";
import { saveTrainingSessionToIndexedDb } from "../training-store";

type SaveState = "idle" | "saving" | "saved" | "duplicate" | "conflict" | "error";

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

function ValidSessionPreview({
  payload,
  warnings
}: {
  payload: SessionPayload;
  warnings: string[];
}) {
  const [saveState, setSaveState] = useState<SaveState>("idle");

  async function handleSave() {
    setSaveState("saving");

    try {
      const result = await saveTrainingSessionToIndexedDb(payload);
      setSaveState(result.status);
    } catch {
      setSaveState("error");
    }
  }

  return (
    <section aria-labelledby="session-preview-title">
      <h2 id="session-preview-title">Session Share Payload v1 미리보기</h2>
      <dl className="diag-grid">
        <dt>수업번호</dt>
        <dd>{payload.sessionNo}</dd>
        <dt>날짜</dt>
        <dd>{payload.date}</dd>
        <dt>수련내용</dt>
        <dd>{payload.kata.length}개</dd>
      </dl>

      <ul className="preview-list">
        {payload.kata.map((kata, index) => (
          <li key={kata.id + "-" + index}>
            <strong>{kata.name}</strong>
            <span className="small">ID: {kata.id}</span>
          </li>
        ))}
      </ul>

      {warnings.map((warning) => (
        <p className="status-warn" key={warning}>{warning}</p>
      ))}

      <p className="small">저장 전 미리보기입니다.</p>
      <button
        className="action-button"
        type="button"
        onClick={handleSave}
        disabled={saveState === "saving" || saveState === "saved"}
      >
        {saveState === "saving"
          ? "저장 중..."
          : saveState === "saved"
            ? "추가됨"
            : "내 수련일지에 추가"}
      </button>

      {saveState === "saved" && (
        <p className="status-ok" role="status">내 수련일지에 추가했습니다.</p>
      )}
      {saveState === "duplicate" && (
        <p className="status-warn" role="status">이미 저장된 수련기록입니다.</p>
      )}
      {saveState === "conflict" && (
        <p className="status-warn" role="status">
          동일 수업번호에 날짜가 다른 기록이 이미 있습니다.
        </p>
      )}
      {saveState === "error" && (
        <p className="status-warn" role="status">
          수련기록을 저장하지 못했습니다. IndexedDB 사용 가능 여부를 확인해 주세요.
        </p>
      )}

      <p className="small">
        Canonical kata catalog 비교는 확정 reference data 추가 후 Phase 2 후속으로 진행합니다.
      </p>
    </section>
  );
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
    <ValidSessionPreview
      key={hash}
      payload={result.payload}
      warnings={result.warnings}
    />
  );
}
