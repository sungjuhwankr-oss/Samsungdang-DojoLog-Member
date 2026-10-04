"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  createExternalEvent,
  deleteExternalEvent,
  EVENTS_CHANGED_EVENT,
  listEventDomain,
  saveEventMemo,
  updateExternalEvent,
  updateSpecialParticipation
} from "../event-store.mjs";
import type {
  EventDomain,
  ExternalEventRecord,
  VerifiedEventView
} from "../event-store.mjs";

type SessionDraft = { sessionId?: string; date: string; label: string };
type ExternalDraft = {
  title: string;
  organizer: string;
  location: string;
  sessions: SessionDraft[];
};

const emptyDraft = (): ExternalDraft => ({
  title: "",
  organizer: "",
  location: "",
  sessions: [{ date: "", label: "" }]
});

export function EventManager() {
  const [domain, setDomain] = useState<EventDomain>({ verified: [], external: [], history: [] });
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<ExternalDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [participation, setParticipation] = useState<Record<string, string[]>>({});
  const [memos, setMemos] = useState<Record<string, string>>({});

  const reload = useCallback(async () => {
    try {
      const next = await listEventDomain();
      setDomain(next);
      setParticipation(Object.fromEntries(next.verified.map(event => [
        event.eventId,
        event.participation?.selectedSessionIds ?? []
      ])));
      setMemos(Object.fromEntries([
        ...next.verified.map(event => [`samsungdang:${event.eventId}`, event.memo?.memo ?? ""]),
        ...next.external.map(event => [`external:${event.eventId}`, event.memo?.memo ?? ""])
      ]));
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(reload, 0);
    window.addEventListener(EVENTS_CHANGED_EVENT, reload);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(EVENTS_CHANGED_EVENT, reload);
    };
  }, [reload]);

  const activeExternal = domain.external.filter(event => event.deletedAt === null);
  const sourceCounts = useMemo(() => ({
    special: domain.verified.reduce((sum, event) =>
      sum + (event.credentialVersion === 2 ? (event.participation?.selectedSessionIds.length ?? 0) : 0), 0),
    external: activeExternal.reduce((sum, event) => sum + event.sessions.length, 0)
  }), [domain, activeExternal]);

  const matches = (event: VerifiedEventView | ExternalEventRecord, eventKey: string) => {
    const needle = query.trim().toLocaleLowerCase("ko");
    if (!needle) return true;
    return [
      event.title,
      "organizer" in event ? event.organizer : null,
      "location" in event ? event.location : null,
      memos[eventKey]
    ]
      .some(value => String(value ?? "").toLocaleLowerCase("ko").includes(needle));
  };

  const updateDraftSession = (index: number, field: "date" | "label", value: string) => {
    setDraft(current => ({
      ...current,
      sessions: current.sessions.map((session, sessionIndex) =>
        sessionIndex === index ? { ...session, [field]: value } : session)
    }));
  };

  const submitExternal = async () => {
    setMessage("");
    try {
      const input = {
        title: draft.title,
        organizer: draft.organizer || null,
        location: draft.location || null,
        sessions: draft.sessions
      };
      if (editingId) await updateExternalEvent(editingId, input);
      else await createExternalEvent(input);
      setEditingId(null);
      setDraft(emptyDraft());
      setMessage(editingId ? "외부행사 변경 이력을 저장했습니다." : "외부행사를 저장했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "외부행사를 저장하지 못했습니다.");
    }
  };

  const beginEdit = (event: ExternalEventRecord) => {
    setEditingId(event.eventId);
    setDraft({
      title: event.title,
      organizer: event.organizer ?? "",
      location: event.location ?? "",
      sessions: event.sessions.map(session => ({ ...session }))
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const saveParticipation = async (eventId: string) => {
    try {
      await updateSpecialParticipation(eventId, participation[eventId] ?? []);
      setMessage("참가 session 선택과 변경 이력을 저장했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "참가 session을 저장하지 못했습니다.");
    }
  };

  const saveMemo = async (eventKey: string) => {
    try {
      await saveEventMemo(eventKey, memos[eventKey] ?? "");
      setMessage("행사 메모를 별도로 저장했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "행사 메모를 저장하지 못했습니다.");
    }
  };

  if (status === "loading") return <section className="panel"><p role="status">행사 기록을 불러오고 있습니다.</p></section>;
  if (status === "error") return <section className="panel"><p className="status-warn" role="alert">검증된 행사 기록을 불러오지 못했습니다.</p></section>;

  return <>
    <section className="panel" aria-labelledby="event-summary-title">
      <h2 id="event-summary-title">행사 수련횟수</h2>
      <p><strong>{sourceCounts.special + sourceCounts.external}회</strong></p>
      <p className="small">삼성당 특별수련 {sourceCounts.special}회 · 외부행사 {sourceCounts.external}회</p>
      <p className="small">일반 수련일지 횟수는 홈의 전체 합계에서 별도 source로 더해집니다. 같은 날짜라도 실제 session마다 1회입니다.</p>
    </section>

    <section className="panel" aria-labelledby="external-form-title">
      <h2 id="external-form-title">{editingId ? "외부행사 수정" : "외부행사 직접 기록"}</h2>
      <p className="small">직접 기록한 외부행사는 일반 수련일지나 Kata 기록을 만들지 않습니다.</p>
      <div className="event-form-grid">
        <label>행사명<input value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label>
        <label>주최 (선택)<input value={draft.organizer} onChange={event => setDraft({ ...draft, organizer: event.target.value })} /></label>
        <label>장소 (선택)<input value={draft.location} onChange={event => setDraft({ ...draft, location: event.target.value })} /></label>
      </div>
      <h3>Session</h3>
      {draft.sessions.map((session, index) => <div className="event-session-row" key={session.sessionId ?? `new-${index}`}>
        <label>날짜<input type="date" value={session.date} onChange={event => updateDraftSession(index, "date", event.target.value)} /></label>
        <label>표시명<input value={session.label} onChange={event => updateDraftSession(index, "label", event.target.value)} /></label>
        {draft.sessions.length > 1 && <button type="button" className="button-secondary" onClick={() => setDraft(current => ({ ...current, sessions: current.sessions.filter((_, itemIndex) => itemIndex !== index) }))}>삭제</button>}
      </div>)}
      <div className="event-actions">
        <button type="button" className="button-secondary" onClick={() => setDraft(current => ({ ...current, sessions: [...current.sessions, { date: "", label: "" }] }))}>Session 추가</button>
        <button type="button" className="cta button-reset" onClick={submitExternal}>{editingId ? "변경 저장" : "행사 저장"}</button>
        {editingId && <button type="button" className="button-secondary" onClick={() => { setEditingId(null); setDraft(emptyDraft()); }}>수정 취소</button>}
      </div>
      {message && <p role="status">{message}</p>}
    </section>

    <section className="panel" aria-labelledby="event-list-title">
      <h2 id="event-list-title">특별수련·외부행사</h2>
      <label>행사·메모 검색<input type="search" value={query} onChange={event => setQuery(event.target.value)} /></label>
      {domain.verified.filter(event => matches(event, `samsungdang:${event.eventId}`)).map(event => {
        const eventKey = `samsungdang:${event.eventId}`;
        const selected = new Set(participation[event.eventId] ?? []);
        return <article className="event-card" key={eventKey}>
          <h3>{event.title}</h3>
          <p>{event.endDate ? `${event.startDate} ~ ${event.endDate}` : event.startDate} · {event.instructor}</p>
          {event.credentialVersion === 1 ? <>
            <p className="small">Credential v1 · session 정보 없음 · 참가 session 0회</p>
            <p className="small">날짜를 근거로 session을 자동 추정하지 않습니다.</p>
          </> : <>
            <fieldset>
              <legend>실제 참가 session</legend>
              {("sessions" in event.payload ? event.payload.sessions : []).map(session => <label className="event-check" key={session.sessionId}>
                <input type="checkbox" checked={selected.has(session.sessionId)} onChange={changeEvent => setParticipation(current => ({
                  ...current,
                  [event.eventId]: changeEvent.target.checked
                    ? [...(current[event.eventId] ?? []), session.sessionId]
                    : (current[event.eventId] ?? []).filter(id => id !== session.sessionId)
                }))} />
                <span>{session.date} · {session.label}</span>
              </label>)}
            </fieldset>
            <p className="small">이 선택은 본인이 기록한 참가 정보이며 암호학적으로 검증된 출석 증명이 아닙니다.</p>
            <button type="button" className="button-secondary" onClick={() => saveParticipation(event.eventId)}>참가 선택 저장</button>
          </>}
          <label>Member 행사 메모<textarea value={memos[eventKey] ?? ""} onChange={memoEvent => setMemos(current => ({ ...current, [eventKey]: memoEvent.target.value }))} /></label>
          <button type="button" className="button-secondary" onClick={() => saveMemo(eventKey)}>메모 저장</button>
        </article>;
      })}
      {activeExternal.filter(event => matches(event, `external:${event.eventId}`)).map(event => {
        const eventKey = `external:${event.eventId}`;
        return <article className="event-card" key={eventKey}>
          <h3>{event.title}</h3>
          <p>{[event.organizer, event.location].filter(Boolean).join(" · ") || "직접 기록 외부행사"}</p>
          <ol>{event.sessions.map(session => <li key={session.sessionId}>{session.date} · {session.label}</li>)}</ol>
          <div className="event-actions">
            <button type="button" className="button-secondary" onClick={() => beginEdit(event)}>수정</button>
            <button type="button" className="button-danger" onClick={async () => {
              if (!window.confirm("이 외부행사를 삭제 상태로 전환할까요? 이력은 보존됩니다.")) return;
              await deleteExternalEvent(event.eventId);
              setMessage("외부행사를 tombstone 처리하고 변경 이력을 보존했습니다.");
            }}>삭제</button>
          </div>
          <label>Member 행사 메모<textarea value={memos[eventKey] ?? ""} onChange={memoEvent => setMemos(current => ({ ...current, [eventKey]: memoEvent.target.value }))} /></label>
          <button type="button" className="button-secondary" onClick={() => saveMemo(eventKey)}>메모 저장</button>
        </article>;
      })}
      {domain.verified.length === 0 && activeExternal.length === 0 && <p>등록된 행사가 없습니다.</p>}
    </section>

    <details className="panel">
      <summary><strong>변경 이력 및 삭제된 행사</strong></summary>
      <p className="small">현재 목록에서 제외된 tombstone과 참가·외부행사 변경 snapshot을 추적합니다.</p>
      <ol className="event-history-list">
        {domain.history.map(entry => <li key={entry.changeId}>
          <details>
            <summary>{entry.changedAt} · {entry.kind} · {entry.eventKey}</summary>
            <pre className="codebox">{JSON.stringify({ before: entry.before, after: entry.after }, null, 2)}</pre>
          </details>
        </li>)}
      </ol>
    </details>
  </>;
}
