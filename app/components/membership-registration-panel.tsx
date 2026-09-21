"use client";

import { useEffect, useState } from "react";

import {
  parseCredentialTokenFromSearch,
  verifyMembershipCredentialToken,
  type CredentialVerificationResult
} from "../credential/membership-verifier.mjs";
import {
  MembershipRegistrationError,
  registerMembershipCredentialToken
} from "../membership-store.mjs";

type ScreenState =
  | { kind: "loading" }
  | { kind: "invalid"; reason: string }
  | { kind: "verified"; token: string; verification: CredentialVerificationResult }
  | { kind: "cancelled" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "registration-error"; message: string };

function registrationMessage(error: unknown) {
  if (error instanceof MembershipRegistrationError) {
    if (error.code === "replay") return "같은 Credential은 다시 등록할 수 없습니다.";
    if (error.code === "existing-membership") {
      return "다른 Membership Credential이 이미 등록되어 있어 자동 교체하지 않았습니다.";
    }
  }
  return "Membership Credential을 저장하지 못했습니다. 회원 기능은 활성화되지 않았습니다.";
}

export function MembershipRegistrationPanel() {
  const [state, setState] = useState<ScreenState>({ kind: "loading" });

  useEffect(() => {
    let active = true;
    async function load() {
      const parsed = parseCredentialTokenFromSearch(window.location.search);
      if (!("token" in parsed)) {
        if (active) setState({ kind: "invalid", reason: parsed.reason });
        return;
      }
      const verification = await verifyMembershipCredentialToken(parsed.token);
      if (!active) return;
      setState(verification.valid
        ? { kind: "verified", token: parsed.token, verification }
        : { kind: "invalid", reason: verification.reason });
    }
    load().catch(() => {
      if (active) setState({ kind: "invalid", reason: "MALFORMED" });
    });
    return () => {
      active = false;
    };
  }, []);

  function cancel() {
    window.history.replaceState(null, "", window.location.pathname);
    setState({ kind: "cancelled" });
  }

  async function confirm(token: string) {
    setState({ kind: "saving" });
    try {
      await registerMembershipCredentialToken(token);
      window.history.replaceState(null, "", window.location.pathname);
      setState({ kind: "saved" });
    } catch (error) {
      setState({ kind: "registration-error", message: registrationMessage(error) });
    }
  }

  if (state.kind === "loading") return <p role="status">Credential을 검증하고 있습니다.</p>;
  if (state.kind === "invalid") {
    return (
      <div role="alert">
        <p className="status-warn">유효한 삼성당 Membership Credential로 확인되지 않았습니다.</p>
        <p className="small">검증 코드: {state.reason}</p>
      </div>
    );
  }
  if (state.kind === "cancelled") return <p role="status">등록을 취소했습니다. 저장된 정보는 변경되지 않았습니다.</p>;
  if (state.kind === "saving") return <p role="status">검증된 Credential을 저장하고 있습니다.</p>;
  if (state.kind === "saved") {
    return (
      <div role="status">
        <p className="status-ok">Membership Credential을 등록했습니다.</p>
        <p>삼성당 회원 기능과 디지털 회원증이 활성화되었습니다.</p>
      </div>
    );
  }
  if (state.kind === "registration-error") {
    return <p className="status-warn" role="alert">{state.message}</p>;
  }

  const payload = state.verification.verifiedPayload;
  if (!payload) return <p className="status-warn" role="alert">검증 결과를 표시할 수 없습니다.</p>;
  return (
    <div>
      <p className="status-ok" role="status">서명이 확인된 Membership Credential입니다.</p>
      <p className="small">아래 내용은 검증된 삼성당 발급정보입니다.</p>
      <dl className="diag-grid credential-preview">
        <dt>성명</dt><dd>{payload.name}</dd>
        <dt>회원번호</dt><dd>{payload.memberId}</dd>
        <dt>입회일</dt><dd>{payload.joinedAt}</dd>
      </dl>
      <div className="button-row">
        <button className="cta" type="button" onClick={() => confirm(state.token)}>회원정보 등록</button>
        <button className="action-button" type="button" onClick={cancel}>등록 취소</button>
      </div>
    </div>
  );
}
