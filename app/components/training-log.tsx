"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import kataCatalog from "../../reference/kata-catalog.v2.json";
import { getCurrentKataPresentation } from "../kata-library.mjs";
import { listMemoSessions } from "../training-journal.mjs";
import type { HydratedTrainingSession, SharedSessionSnapshotRecord } from "../training-records.mjs";
import {
  createPersonalTrainingSession,
  deletePersonalTrainingSession,
  getSharedSessionSnapshot,
  listTrainingSessions,
  restoreSharedTrainingSession,
  TRAINING_DATA_CHANGED_EVENT,
  updateTrainingSession
} from "../training-store";

type KataValue = { id: string; name: string };
type LoadState = "loading" | "ready" | "error";
type JournalView = "all" | "memo" | "search";

function sessionAnchor(record: Pick<HydratedTrainingSession, "dojo" | "sessionNo">) {
  return `session-${encodeURIComponent(record.dojo)}-${record.sessionNo}`;
}

function sessionLabel(record: Pick<HydratedTrainingSession, "source" | "sessionNo">) {
  return record.source === "shared" ? `공유수업 ${record.sessionNo}` : `개인수련 · 기록 ${record.sessionNo}`;
}

function CurrentKataVideo({ id }: { id: string }) {
  const presentation = getCurrentKataPresentation(kataCatalog, id);
  if (presentation.status === "unknown") {
    return <span className="kata-video-state unknown">카탈로그 외 기록</span>;
  }
  if (presentation.status === "no-video") {
    return <span className="kata-video-state">영상 없음</span>;
  }
  return (
    <span className="saved-kata-video-links">
      {presentation.links.map((link, index) => (
        <a key={`${link.url}-${link.label ?? ""}`} href={link.url} target="_blank" rel="noreferrer">
          {presentation.links.length === 1
            ? "영상 보기"
            : `영상 보기${link.label ? ` (${link.label})` : ` ${index + 1}`}`}
        </a>
      ))}
    </span>
  );
}

function KataEditor({ values, onChange }: { values: KataValue[]; onChange(values: KataValue[]): void }) {
  const available = kataCatalog.kata.filter((kata) => !values.some((value) => value.id === kata.id));
  const [selectedId, setSelectedId] = useState("");

  function addSelected() {
    const kata = kataCatalog.kata.find((item) => item.id === selectedId);
    if (!kata) return;
    onChange([...values, { id: kata.id, name: kata.nameKo }]);
    setSelectedId("");
  }

  return (
    <div className="kata-editor">
      {values.length === 0 ? <p className="small">카타 없음 — zero-kata session으로 저장할 수 있습니다.</p> : (
        <ul className="editable-kata-list">
          {values.map((kata) => (
            <li key={kata.id}>
              <span className="saved-kata-label"><span>{kata.name}</span><CurrentKataVideo id={kata.id} /></span>
              <button type="button" className="secondary-button" onClick={() => onChange(values.filter((item) => item.id !== kata.id))}>삭제</button>
            </li>
          ))}
        </ul>
      )}
      <div className="inline-controls">
        <select aria-label="추가할 카타" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
          <option value="">카타 선택</option>
          {available.map((kata) => <option key={kata.id} value={kata.id}>{kata.nameKo}</option>)}
        </select>
        <button type="button" className="secondary-button" disabled={!selectedId} onClick={addSelected}>카타 추가</button>
      </div>
    </div>
  );
}

function SnapshotView({ snapshot }: { snapshot: SharedSessionSnapshotRecord }) {
  return (
    <div className="snapshot-box" aria-label="공유 원본">
      <p><strong>공유 원본</strong> · 수업 {snapshot.sessionNo} · {snapshot.date}</p>
      {snapshot.kata.length === 0 ? <p className="small">원본 카타 없음</p> : (
        <ol>{snapshot.kata.map((kata) => <li key={`${kata.id}-${kata.order}`}><span>{kata.name}</span> <CurrentKataVideo id={kata.id} /></li>)}</ol>
      )}
    </div>
  );
}

function SessionEditor({ record }: { record: HydratedTrainingSession }) {
  const [date, setDate] = useState(record.date);
  const [note, setNote] = useState(record.note);
  const [kata, setKata] = useState<KataValue[]>(record.kata.map(({ id, name }) => ({ id, name })));
  const [snapshot, setSnapshot] = useState<SharedSessionSnapshotRecord | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const shared = record.source === "shared";

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    try {
      await updateTrainingSession(record.dojo, record.sessionNo, { date, note, kata });
      setStatus("수련일지를 저장했습니다.");
    } catch {
      setStatus("수련일지를 저장할 수 없습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function showSnapshot() {
    setBusy(true);
    setStatus("");
    try {
      const value = await getSharedSessionSnapshot(record.dojo, record.sessionNo);
      setSnapshot(value);
      if (!value) setStatus("공유 원본을 찾을 수 없습니다.");
    } catch {
      setStatus("공유 원본을 읽을 수 없습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function restoreSnapshot() {
    if (!window.confirm("카타 구성을 공유 원본으로 복원하시겠습니까? 메모는 유지됩니다.")) return;
    setBusy(true);
    setStatus("");
    try {
      const restored = await restoreSharedTrainingSession(record.dojo, record.sessionNo);
      setKata(restored.kata.map(({ id, name }) => ({ id, name })));
      setNote(restored.note);
      setStatus("공유 원본으로 복원했습니다. 메모는 유지했습니다.");
    } catch {
      setStatus("공유 원본으로 복원할 수 없습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function removePersonal() {
    if (!window.confirm("이 개인수련 기록을 삭제하시겠습니까?")) return;
    setBusy(true);
    setStatus("");
    try {
      await deletePersonalTrainingSession(record.dojo, record.sessionNo);
    } catch {
      setStatus("개인수련 기록을 삭제할 수 없습니다.");
      setBusy(false);
    }
  }

  return (
    <li id={sessionAnchor(record)} className="session-card">
      <div className="session-card-heading">
        <strong>{sessionLabel(record)}</strong>
        <span className={`source-badge ${shared ? "shared" : "personal"}`}>{shared ? "공유" : "개인"}</span>
        <span>{record.date}</span>
      </div>
      <p className="small">수련내용 {record.kata.length}개{record.note.trim() ? " · 메모 있음" : ""}</p>
      <details>
        <summary>수련일지 보기·수정</summary>
        <form className="compact-form session-edit-form" onSubmit={save}>
          <label>
            날짜
            <input type="date" value={date} disabled={shared} required onChange={(event) => setDate(event.target.value)} />
          </label>
          {shared && <p className="small">공유수업의 dojo·수업번호·날짜는 변경할 수 없습니다.</p>}
          <label>
            메모
            <textarea value={note} maxLength={20_000} rows={5} onChange={(event) => setNote(event.target.value)} />
          </label>
          <fieldset>
            <legend>카타</legend>
            <KataEditor values={kata} onChange={setKata} />
          </fieldset>
          <div className="button-row">
            <button className="action-button" type="submit" disabled={busy}>변경 저장</button>
            {shared && <button className="secondary-button" type="button" disabled={busy} onClick={showSnapshot}>공유 원본 보기</button>}
            {shared && <button className="secondary-button" type="button" disabled={busy} onClick={restoreSnapshot}>공유 원본 복원</button>}
            {!shared && <button className="danger-button" type="button" disabled={busy} onClick={removePersonal}>개인수련 삭제</button>}
          </div>
        </form>
        {snapshot && <SnapshotView snapshot={snapshot} />}
        {status && <p role="status">{status}</p>}
      </details>
    </li>
  );
}

export function TrainingLog() {
  const [records, setRecords] = useState<HydratedTrainingSession[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [kata, setKata] = useState<KataValue[]>([]);
  const [createStatus, setCreateStatus] = useState("");
  const [memoQuery, setMemoQuery] = useState("");
  const [view, setView] = useState<JournalView>("all");

  const reload = useCallback(() => {
    listTrainingSessions().then(
      (value) => {
        setRecords(value);
        setLoadState("ready");
      },
      () => setLoadState("error")
    );
  }, []);

  useEffect(() => {
    reload();
    window.addEventListener(TRAINING_DATA_CHANGED_EVENT, reload);
    return () => window.removeEventListener(TRAINING_DATA_CHANGED_EVENT, reload);
  }, [reload]);

  const memoRecords = useMemo(() => listMemoSessions(records, memoQuery), [records, memoQuery]);

  async function createPersonal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateStatus("");
    try {
      await createPersonalTrainingSession({ date, note, kata });
      setNote("");
      setKata([]);
      setCreateStatus("개인수련을 저장했습니다.");
    } catch {
      setCreateStatus("개인수련을 저장할 수 없습니다.");
    }
  }

  function openOriginal(record: HydratedTrainingSession) {
    setView("all");
    window.setTimeout(() => {
      const anchor = sessionAnchor(record);
      const details = document.querySelector(`#${CSS.escape(anchor)} details`);
      if (details instanceof HTMLDetailsElement) details.open = true;
      document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  const shownMemos = view === "search" && !memoQuery.trim() ? [] : memoRecords;

  return (
    <>
      <section className="panel" aria-labelledby="training-log-title">
        <h2 id="training-log-title">내 수련일지</h2>
        <div className="section-tabs" role="tablist" aria-label="수련일지 보기">
          <button type="button" role="tab" aria-selected={view === "all"} onClick={() => setView("all")}>전체</button>
          <button type="button" role="tab" aria-selected={view === "memo"} onClick={() => setView("memo")}>메모</button>
          <button type="button" role="tab" aria-selected={view === "search"} onClick={() => setView("search")}>검색</button>
        </div>

        {view === "all" ? <div role="tabpanel">
          <details className="create-session-box">
            <summary>개인수련 추가</summary>
            <form className="compact-form" onSubmit={createPersonal}>
              <label>수련일<input type="date" required value={date} onChange={(event) => setDate(event.target.value)} /></label>
              <label>메모<textarea value={note} maxLength={20_000} rows={5} onChange={(event) => setNote(event.target.value)} /></label>
              <fieldset><legend>카타</legend><KataEditor values={kata} onChange={setKata} /></fieldset>
              <button className="action-button" type="submit">개인수련 저장</button>
            </form>
            <p className="small">과거 날짜와 같은 날짜의 복수 수련을 기록할 수 있습니다. 카타 없이도 저장할 수 있습니다.</p>
            {createStatus && <p role="status">{createStatus}</p>}
          </details>

          {loadState === "loading" && <p>저장된 기록을 확인하는 중입니다.</p>}
          {loadState === "error" && <p className="status-warn" role="status">IndexedDB에서 수련일지를 읽을 수 없습니다.</p>}
          {loadState === "ready" && records.length === 0 && <p>저장된 수련일지가 없습니다.</p>}
          {records.length > 0 && <ul className="session-list">{records.map((record) => <SessionEditor key={`${record.dojo}-${record.sessionNo}`} record={record} />)}</ul>}

        </div> : <div role="tabpanel">
          {view === "search" && <label className="search-field">메모 본문 검색<input type="search" value={memoQuery} onChange={(event) => setMemoQuery(event.target.value)} /></label>}
          {view === "search" && !memoQuery.trim() && <p className="small">검색할 메모 내용을 입력하십시오.</p>}
          {shownMemos.length === 0 && (view === "memo" || memoQuery.trim()) ? <p className="small">조건에 맞는 메모가 없습니다.</p> : (
            <ul className="memo-list">
              {shownMemos.map((record) => (
                <li key={`${record.dojo}-${record.sessionNo}`}>
                  <a href={`#${sessionAnchor(record)}`} onClick={() => openOriginal(record)}>
                    <strong>{sessionLabel(record)}</strong>
                    <span>{record.source === "shared" ? "공유" : "개인"} · {record.date}</span>
                    <p>{record.note}</p>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>}
      </section>
    </>
  );
}
