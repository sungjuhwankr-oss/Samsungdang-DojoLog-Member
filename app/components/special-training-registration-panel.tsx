"use client";

import { useEffect, useState } from "react";

import {
  parseCredentialTokenFromSearch,
  type VerifiedSpecialTrainingPayload
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
  | { kind: "verified"; token: string; preview: Preview }
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
  if (reason === "membership-required") return "Membership Credential 등록 필요";
  if (reason === "credential-replay") return "같은 Special-training Credential이 이미 등록되어 있습니다.";
  if (reason === "event-replay") return "같은 특별수련 행사가 이미 등록되어 있습니다.";
  if (reason === "event-conflict") return "같은 행사 ID에 서로 다른 내용이 확인되어 등록할 수 없습니다.";
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
      setState(preview.verification.valid
        ? { kind: "verified", token: parsed.token, preview }
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

  async function confirm(token: string, title: string) {
    setState({ kind: "saving" });
    try {
      await registerSpecialTrainingCredentialToken(token);
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
  const assessment = state.preview.assessment;
  if (!payload || !assessment) return <p className="status-warn" role="alert">검증 결과를 표시할 수 없습니다.</p>;
  return <div>
    <p className="status-ok" role="status">서명이 확인된 Special-training Credential입니다.</p>
    <p className="small">아래 내용은 검증된 삼성당 발급정보이며, 확인 전에는 이력이 저장되지 않습니다.</p>
    <dl className="diag-grid credential-preview">
      <dt>행사명</dt><dd>{payload.title}</dd>
      <dt>구분</dt><dd>{categoryLabel[payload.category] ?? payload.category}</dd>
      <dt>기간</dt><dd>{payload.endDate ? `${payload.startDate} ~ ${payload.endDate}` : payload.startDate}</dd>
      <dt>지도자</dt><dd>{payload.instructor}</dd>
    </dl>
    {!assessment.canConfirm && <p className="status-warn">{reasonMessage(assessment.reason)}</p>}
    <div className="button-row">
      {assessment.canConfirm && <button className="cta" type="button" onClick={() => confirm(state.token, payload.title)}>특별수련 이력 등록</button>}
      <button className="action-button" type="button" onClick={cancel}>등록 취소</button>
    </div>
  </div>;
}
