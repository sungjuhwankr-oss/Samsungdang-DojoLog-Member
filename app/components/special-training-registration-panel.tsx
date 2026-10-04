"use client";

import { useEffect, useState } from "react";

import {
  parseCredentialTokenFromSearch,
  type VerifiedSpecialTrainingPayload,
  type VerifiedSpecialTrainingV2Payload
} from "../credential/special-training-verifier.mjs";
import {
  previewSpecialTrainingCredentialToken,
  registerSpecialTrainingCredentialToken,
  SpecialTrainingRegistrationError
} from "../special-training-store.mjs";

type Preview = Awaited<ReturnType<typeof previewSpecialTrainingCredentialToken>>;
type ScreenState =
  | { kind: "loading" }
  | { kind: "invalid"; reason: string }
  | { kind: "verified"; token: string; preview: Preview; selectedSessionIds: string[] }
  | { kind: "cancelled" }
  | { kind: "saving" }
  | { kind: "saved"; title: string }
  | { kind: "registration-error"; message: string };

const categoryLabel: Record<string, string> = {
  seminar: "세미나",
  workshop: "워크숍",
  "special-training": "특별수련",
  camp: "합숙",
  other: "기타"
};

function reasonMessage(reason: string) {
  if (reason === "credential-replay") return "같은 Special-training Credential이 이미 등록되어 있습니다.";
  if (reason === "event-replay") return "같은 특별수련 행사가 이미 등록되어 있습니다.";
  if (reason === "event-conflict") return "같은 행사 ID에 서로 다른 내용이 확인되어 등록할 수 없습니다.";
  if (reason === "revision-fork") return "현재 Credential에서 이어지지 않은 correction입니다.";
  if (reason === "revision-downgrade") return "현재보다 이전 revision은 등록할 수 없습니다.";
  if (reason === "revision-skip") return "중간 revision을 건너뛴 correction은 등록할 수 없습니다.";
  if (reason === "revision-conflict") return "같은 revision에 서로 다른 내용이 있습니다.";
  if (reason === "session-identity-conflict") return "기존 sessionId의 의미가 변경되어 correction을 받을 수 없습니다.";
  if (reason === "session-selection-required") return "실제 참가한 session을 한 개 이상 선택해야 합니다.";
  if (reason === "stale-preview") return "다른 화면에서 현재 행사 revision이 변경되었습니다. 링크를 다시 열어 확인하십시오.";
  if (reason === "invalid-history") return "저장된 특별수련 이력을 확인할 수 없습니다.";
  return reason;
}

function registrationMessage(error: unknown) {
  if (error instanceof SpecialTrainingRegistrationError) return reasonMessage(error.code);
  return "특별수련 이력을 저장하지 못했습니다. 기존 이력은 변경되지 않았습니다.";
}

export function SpecialTrainingRegistrationPanel() {
  const [state, setState] = useState<ScreenState>({ kind: "loading" });

  useEffect(() => {
    let active = true;
    async function load() {
      const parsed = parseCredentialTokenFromSearch(window.location.search);
      if (!("token" in parsed)) {
        if (active) setState({ kind: "invalid", reason: parsed.reason });
        return;
      }
      const preview = await previewSpecialTrainingCredentialToken(parsed.token);
      if (!active) return;
      const selectedSessionIds = preview.verification.valid && preview.verification.credentialVersion === 2
        ? (preview.participation?.selectedSessionIds ?? []).filter(sessionId =>
          (preview.verification.verifiedPayload as VerifiedSpecialTrainingV2Payload).sessions.some(session => session.sessionId === sessionId)
        )
        : [];
      setState(preview.verification.valid
        ? { kind: "verified", token: parsed.token, preview, selectedSessionIds }
        : { kind: "invalid", reason: preview.verification.reason });
    }
    load().catch(() => {
      if (active) setState({ kind: "invalid", reason: "MALFORMED" });
    });
    return () => { active = false; };
  }, []);

  function clearQuery() {
    window.history.replaceState(null, "", window.location.pathname);
  }

  function cancel() {
    clearQuery();
    setState({ kind: "cancelled" });
  }

  async function confirm(token: string, title: string, selectedSessionIds: string[]) {
    setState({ kind: "saving" });
    try {
      await registerSpecialTrainingCredentialToken(token, { selectedSessionIds });
      clearQuery();
      setState({ kind: "saved", title });
    } catch (error) {
      setState({ kind: "registration-error", message: registrationMessage(error) });
    }
  }

  if (state.kind === "loading") return <p role="status">Special-training Credential을 검증하고 있습니다.</p>;
  if (state.kind === "invalid") return <div role="alert"><p className="status-warn">유효한 삼성당 Special-training Credential로 확인되지 않았습니다.</p><p className="small">검증 코드: {state.reason}</p></div>;
  if (state.kind === "cancelled") return <p role="status">등록을 취소했습니다. 저장된 특별수련 이력은 변경되지 않았습니다.</p>;
  if (state.kind === "saving") return <p role="status">현재 이력을 다시 확인하고 저장하고 있습니다.</p>;
  if (state.kind === "saved") return <div role="status"><p className="status-ok">특별수련 이력을 등록했습니다.</p><p>{state.title}</p></div>;
  if (state.kind === "registration-error") return <p className="status-warn" role="alert">{state.message}</p>;

  const payload = state.preview.verification.verifiedPayload as VerifiedSpecialTrainingPayload;
  const credentialVersion = state.preview.verification.credentialVersion ?? 1;
  const payloadV2 = credentialVersion === 2 ? payload as VerifiedSpecialTrainingV2Payload : null;
  const assessment = state.preview.assessment;
  if (!payload || !assessment) return <p className="status-warn" role="alert">검증 결과를 표시할 수 없습니다.</p>;
  const reconcilesCorrection = payloadV2 !== null && assessment.reason === "correction" && state.preview.participation !== null;
  return <div>
    <p className="status-ok" role="status">서명이 확인된 Special-training Credential입니다.</p>
    <p className="small">아래 내용은 검증된 삼성당 발급정보이며, 확인 전에는 이력이 저장되지 않습니다.</p>
    <dl className="diag-grid credential-preview">
      <dt>행사명</dt><dd>{payload.title}</dd>
      <dt>구분</dt><dd>{categoryLabel[payload.category] ?? payload.category}</dd>
      <dt>기간</dt><dd>{payload.endDate ? `${payload.startDate} ~ ${payload.endDate}` : payload.startDate}</dd>
      <dt>지도자</dt><dd>{payload.instructor}</dd>
      <dt>Credential</dt><dd>special-training v{credentialVersion}</dd>
    </dl>
    {payloadV2 ? <fieldset className="event-session-picker">
      <legend>실제 참가 session 선택</legend>
      <p className="small">이 선택은 본인의 참가 기록이며, 암호학적으로 검증된 출석 증명이 아닙니다.</p>
      {payloadV2.sessions.map(session => <label key={session.sessionId}>
        <input
          type="checkbox"
          disabled={reconcilesCorrection}
          checked={state.selectedSessionIds.includes(session.sessionId)}
          onChange={event => setState(current => current.kind !== "verified" ? current : ({
            ...current,
            selectedSessionIds: event.target.checked
              ? [...current.selectedSessionIds, session.sessionId]
              : current.selectedSessionIds.filter(id => id !== session.sessionId)
          }))}
        />
        <span>{session.date} · {session.label}</span>
      </label>)}
      {reconcilesCorrection && <p className="small">Correction 수락 시 unchanged session 선택은 유지되고, 삭제된 session은 current에서 제외되며, 새 session은 미선택으로 시작합니다. 수락 후 참가 선택을 별도로 수정할 수 있습니다.</p>}
    </fieldset> : <div className="status-warn">
      <p>session 정보 없음</p>
      <p className="small">special-training v1은 참가 session을 추정하지 않으며 수련횟수는 0회입니다.</p>
    </div>}
    {!assessment.canConfirm && <p className="status-warn">{reasonMessage(assessment.reason)}</p>}
    {payloadV2 && !reconcilesCorrection && state.selectedSessionIds.length === 0 && assessment.canConfirm && <p className="status-warn">참가 session을 한 개 이상 선택하십시오.</p>}
    <div className="button-row">
      {assessment.canConfirm && <button
        className="cta"
        type="button"
        disabled={payloadV2 !== null && !reconcilesCorrection && state.selectedSessionIds.length === 0}
        onClick={() => confirm(state.token, payload.title, state.selectedSessionIds)}
      >특별수련 이력 등록</button>}
      <button className="action-button" type="button" onClick={cancel}>등록 취소</button>
    </div>
  </div>;
}
