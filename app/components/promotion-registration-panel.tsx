"use client";

import { useEffect, useState } from "react";

import {
  parseCredentialTokenFromSearch,
  type VerifiedPromotionPayload
} from "../credential/promotion-verifier.mjs";
import { rankLabel } from "../promotion-records.mjs";
import {
  PromotionRegistrationError,
  previewPromotionCredentialToken,
  registerPromotionCredentialToken
} from "../promotion-store.mjs";

type Preview = Awaited<ReturnType<typeof previewPromotionCredentialToken>>;
type ScreenState =
  | { kind: "loading" }
  | { kind: "invalid"; reason: string }
  | { kind: "verified"; token: string; preview: Preview }
  | { kind: "cancelled" }
  | { kind: "saving" }
  | { kind: "saved"; rank: string }
  | { kind: "registration-error"; message: string };

function registrationMessage(error: unknown) {
  if (error instanceof PromotionRegistrationError) {
    if (error.code === "membership-required") return "Membership Credential 등록 필요";
    if (error.code === "member-mismatch") return "이 Credential의 회원번호가 등록된 Membership과 일치하지 않습니다.";
    if (error.code === "replay") return "같은 Promotion Credential은 다시 등록할 수 없습니다.";
    if (error.code === "exam-date-replay") return "같은 심사일의 승급 결과가 이미 등록되어 있습니다.";
    if (error.code === "target-conflict") return "현재 단급과 같거나 낮은 target 결과는 등록할 수 없습니다.";
  }
  return "Promotion Credential을 저장하지 못했습니다. 기존 승급이력은 변경되지 않았습니다.";
}

function previewReason(reason: string) {
  if (reason === "membership-required") return "Membership Credential 등록 필요";
  if (reason === "member-mismatch") return "등록된 Membership의 회원번호와 일치하지 않습니다.";
  if (reason === "replay") return "이미 등록된 Promotion Credential입니다.";
  if (reason === "exam-date-replay") return "같은 심사일의 승급 결과가 이미 등록되어 있습니다.";
  if (reason === "target-conflict") return "현재 단급과 같거나 낮은 target 결과입니다.";
  if (reason === "current-rank-invalid") return "현재 승급이력에서 다음 단급을 계산할 수 없습니다.";
  return reason;
}

export function PromotionRegistrationPanel() {
  const [state, setState] = useState<ScreenState>({ kind: "loading" });

  useEffect(() => {
    let active = true;
    async function load() {
      const parsed = parseCredentialTokenFromSearch(window.location.search);
      if (!("token" in parsed)) {
        if (active) setState({ kind: "invalid", reason: parsed.reason });
        return;
      }
      const preview = await previewPromotionCredentialToken(parsed.token);
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

  async function confirm(token: string) {
    setState({ kind: "saving" });
    try {
      const saved = await registerPromotionCredentialToken(token);
      if (!saved.assessment.resultRank) throw new Error("missing promotion result rank");
      clearQuery();
      setState({ kind: "saved", rank: rankLabel(saved.assessment.resultRank) });
    } catch (error) {
      setState({ kind: "registration-error", message: registrationMessage(error) });
    }
  }

  if (state.kind === "loading") return <p role="status">Promotion Credential을 검증하고 있습니다.</p>;
  if (state.kind === "invalid") return <div role="alert"><p className="status-warn">유효한 삼성당 Promotion Credential로 확인되지 않았습니다.</p><p className="small">검증 코드: {state.reason}</p></div>;
  if (state.kind === "cancelled") return <p role="status">등록을 취소했습니다. 저장된 승급이력은 변경되지 않았습니다.</p>;
  if (state.kind === "saving") return <p role="status">현재 승급이력을 다시 확인하고 저장하고 있습니다.</p>;
  if (state.kind === "saved") return <div role="status"><p className="status-ok">승급이력을 등록했습니다.</p><p>현재 확인된 단급: {state.rank}</p></div>;
  if (state.kind === "registration-error") return <p className="status-warn" role="alert">{state.message}</p>;

  const payload = state.preview.verification.verifiedPayload as VerifiedPromotionPayload;
  const assessment = state.preview.assessment;
  if (!payload || !assessment?.resultRank) return <p className="status-warn" role="alert">검증 결과를 표시할 수 없습니다.</p>;
  return <div>
    <p className="status-ok" role="status">서명이 확인된 Promotion Credential입니다.</p>
    <p className="small">아래 내용은 검증된 삼성당 발급정보이며, 확인 전에는 저장되지 않습니다.</p>
    <dl className="diag-grid credential-preview">
      <dt>구분</dt><dd>{payload.eventType === "promoted" ? "승급·승단" : "입회·이적 시 인정"}</dd>
      {payload.eventType === "promoted" ? <><dt>심사일</dt><dd>{payload.examDate}</dd></> : <>
        <dt>회원번호</dt><dd>{payload.memberId}</dd>
        <dt>인정일</dt><dd>{payload.recognizedAt}</dd>
        <dt>단급 취득일</dt><dd>{payload.rankDate ?? "날짜 미상"}</dd>
      </>}
      <dt>현재 확인 단급</dt><dd>{assessment.currentRank ? rankLabel(assessment.currentRank) : "무급"}</dd>
      <dt>등록 결과</dt><dd>{rankLabel(assessment.resultRank)}</dd>
    </dl>
    {!assessment.canConfirm && <p className="status-warn">{previewReason(assessment.reason)}</p>}
    <div className="button-row">
      {assessment.canConfirm && <button className="cta" type="button" onClick={() => confirm(state.token)}>승급이력 등록</button>}
      <button className="action-button" type="button" onClick={cancel}>등록 취소</button>
    </div>
  </div>;
}
