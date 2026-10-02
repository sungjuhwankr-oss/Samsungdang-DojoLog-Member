"use client";

import { useEffect, useState } from "react";

import { parseOnboardingBundleFromSearch } from "../credential/onboarding-verifier.mjs";
import {
  loadActiveOnboardingState,
  OnboardingRegistrationError,
  previewMemberOnboardingToken,
  registerMemberOnboardingToken,
  updateProgressBaseline
} from "../onboarding-store.mjs";
import type {
  ActiveOnboardingState,
  ProgressBaselineRecord
} from "../onboarding-store.mjs";
import type {
  OnboardingKataBaselinePayload,
  OnboardingRankPayload,
  VerifiedMemberOnboardingPayload
} from "../credential/onboarding-verifier.mjs";

type PreviewResult = Awaited<ReturnType<typeof previewMemberOnboardingToken>> & {
  verification: Awaited<ReturnType<typeof previewMemberOnboardingToken>>["verification"] & {
    valid: true;
    verifiedPayload: Readonly<VerifiedMemberOnboardingPayload>;
  };
};

type State =
  | { kind: "loading" }
  | { kind: "empty"; current: ActiveOnboardingState | null }
  | { kind: "invalid"; reason: string }
  | { kind: "preview"; token: string; result: PreviewResult }
  | { kind: "cancelled" }
  | { kind: "saving" }
  | { kind: "saved"; current: ActiveOnboardingState | null }
  | { kind: "error"; message: string };

function baselineText(value: number | null) {
  return value === null ? "unknown" : String(value);
}

function errorMessage(error: unknown) {
  if (error instanceof OnboardingRegistrationError) return `등록 중단: ${error.code}`;
  return "Onboarding 등록을 완료하지 못했습니다.";
}

export function OnboardingRegistrationPanel() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let active = true;
    const parsed = parseOnboardingBundleFromSearch(window.location.search);
    if (!("token" in parsed)) {
      const reason = parsed.reason;
      loadActiveOnboardingState().then(current => {
        if (active) setState({ kind: "empty", current });
      }, () => active && setState({ kind: "invalid", reason }));
      return () => { active = false; };
    }
    previewMemberOnboardingToken(parsed.token).then(result => {
      if (!active) return;
      setState(result.verification.valid && result.verification.verifiedPayload
        ? { kind: "preview", token: parsed.token, result: result as PreviewResult }
        : { kind: "invalid", reason: result.verification.reason });
    }, () => active && setState({ kind: "invalid", reason: "MALFORMED" }));
    return () => { active = false; };
  }, []);

  async function confirm(token: string) {
    setState({ kind: "saving" });
    try {
      await registerMemberOnboardingToken(token);
      window.history.replaceState(null, "", window.location.pathname);
      setState({ kind: "saved", current: await loadActiveOnboardingState() });
    } catch (error) {
      setState({ kind: "error", message: errorMessage(error) });
    }
  }

  function cancel() {
    window.history.replaceState(null, "", window.location.pathname);
    setState({ kind: "cancelled" });
  }

  async function editBaseline(baseline: ProgressBaselineRecord) {
    const raw = window.prompt("숫자 또는 unknown을 입력하십시오.", baseline.value === null ? "unknown" : String(baseline.value));
    if (raw === null) return;
    const value = raw.trim().toLowerCase() === "unknown" ? null : Number(raw);
    try {
      await updateProgressBaseline(baseline.baselineId, value);
      setState({ kind: "saved", current: await loadActiveOnboardingState() });
    } catch {
      setState({ kind: "error", message: "baseline 수정값을 저장하지 못했습니다." });
    }
  }

  if (state.kind === "loading" || state.kind === "saving") return <p role="status">Onboarding bundle을 검증하고 있습니다.</p>;
  if (state.kind === "invalid") return <p className="status-warn" role="alert">유효한 onboarding bundle이 아닙니다. ({state.reason})</p>;
  if (state.kind === "cancelled") return <p role="status">등록을 취소했습니다. 저장된 정보는 변경되지 않았습니다.</p>;
  if (state.kind === "error") return <p className="status-warn" role="alert">{state.message}</p>;

  if (state.kind === "preview") {
    const payload = state.result.verification.verifiedPayload;
    const current = payload.recognizedRanks.at(-1)!;
    return <div>
      <p className="status-ok">서명이 확인된 삼성당 member-onboarding bundle입니다.</p>
      <dl className="diag-grid credential-preview">
        <dt>성명</dt><dd>{payload.membership.name}</dd>
        <dt>회원번호</dt><dd>{payload.membership.memberId}</dd>
        <dt>입회일</dt><dd>{payload.membership.joinedAt}</dd>
        <dt>현재 단급</dt><dd>{current.rankValue}{current.rankType === "kyu" ? "급" : "단"}</dd>
        <dt>현재 단급 취득일</dt><dd>{current.rankDate ?? "날짜 미상"}</dd>
        <dt>현급 baseline</dt><dd>{baselineText(payload.currentRankSessionBaseline)}</dd>
        <dt>Kata baseline</dt><dd>{payload.kataBaselines.length}개 항목</dd>
      </dl>
      <h3>Verified prior rank history</h3>
      <ul>{payload.recognizedRanks.map((rank: OnboardingRankPayload) => <li key={rank.entryId}>{rank.rankValue}{rank.rankType === "kyu" ? "급" : "단"} · {rank.rankDate ?? "날짜 미상"}</li>)}</ul>
      <h3>Kata reference baseline</h3>
      {payload.kataBaselines.length === 0 ? <p>제공되지 않음(unset)</p> : <ul>{payload.kataBaselines.map((item: OnboardingKataBaselinePayload) => <li key={item.kataId}>{item.kataId}: {baselineText(item.count)}</li>)}</ul>}
      <p className="status-warn">baseline은 지도자가 제공한 reference이며 signed rank fact나 실제 session 기록이 아닙니다. 심사 응시자격 또는 합격을 자동 확정하지 않습니다.</p>
      {!state.result.assessment?.canConfirm && <p className="status-warn">등록할 수 없습니다: {state.result.assessment?.reason}</p>}
      <div className="button-row">
        <button className="cta" type="button" disabled={!state.result.assessment?.canConfirm} onClick={() => void confirm(state.token)}>명시적으로 확인하고 일괄 등록</button>
        <button className="action-button" type="button" onClick={cancel}>등록 취소</button>
      </div>
    </div>;
  }

  const current = state.current;
  if (!current) return <p>onboarding link 또는 QR을 열면 전체 내용을 검증한 뒤 등록할 수 있습니다.</p>;
  return <div>
    <p className="status-ok">등록된 onboarding identity와 verified rank가 있습니다.</p>
    <dl className="diag-grid credential-preview"><dt>회원번호</dt><dd>{current.receipt.memberId}</dd><dt>revision</dt><dd>{current.receipt.revision}</dd></dl>
    <h3>Reference baseline</h3>
    <ul>{current.baselines.map((baseline: ProgressBaselineRecord) => <li key={baseline.baselineId}>
      {baseline.kind} / {baseline.subjectId}: {baselineText(baseline.value)} ({baseline.provenance})
      <button className="action-button" type="button" onClick={() => void editBaseline(baseline)}>수정</button>
    </li>)}</ul>
    <p className="small">0은 확인된 0회, unknown은 명시적 미상, 항목 없음은 미제공 상태입니다.</p>
  </div>;
}
