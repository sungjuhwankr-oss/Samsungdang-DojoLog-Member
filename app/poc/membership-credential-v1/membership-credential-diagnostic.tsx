"use client";

import { useState } from "react";

import fixture from "./fixtures/membership-test-credential-v1.json";
import {
  CREDENTIAL_REASON,
  encodeCredentialTransportJson,
  verifyMembershipCredentialToken
} from "../../credential/membership-verifier.mjs";
import { encodeUnpaddedBase64Url } from "../../credential/base64url.mjs";
import { PRODUCTION_TRUSTED_KEY_REGISTRY } from "../../credential/trusted-key-registry.mjs";

type DiagnosticResult = {
  active: boolean;
  verifyOnly: boolean;
  blocked: boolean;
  unknown: boolean;
  tamper: boolean;
  malformed: boolean;
};

const keyId = fixture.signed.keyId;
const productionEntry = PRODUCTION_TRUSTED_KEY_REGISTRY[keyId];
const tokenFor = (value: unknown) => encodeCredentialTransportJson(JSON.stringify(value));
const pass = (value: boolean) => value ? "PASS" : "FAIL";

export function MembershipCredentialDiagnostic() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<DiagnosticResult | null>(null);
  const [error, setError] = useState("");

  async function run() {
    setRunning(true);
    setResult(null);
    setError("");
    try {
      const token = tokenFor(fixture);
      const active = await verifyMembershipCredentialToken(token);
      const verifyOnly = await verifyMembershipCredentialToken(token, {
        registry: { [keyId]: { ...productionEntry, status: "verify-only" } }
      });
      const blocked = await verifyMembershipCredentialToken(token, {
        registry: { [keyId]: { ...productionEntry, status: "blocked" } }
      });
      const unknownFixture = structuredClone(fixture);
      unknownFixture.signed.keyId = `k1_${encodeUnpaddedBase64Url(new Uint8Array(32))}`;
      const unknown = await verifyMembershipCredentialToken(tokenFor(unknownFixture));
      const tamperedFixture = structuredClone(fixture);
      tamperedFixture.signed.payload.name = "변조된 테스트회원";
      const tampered = await verifyMembershipCredentialToken(tokenFor(tamperedFixture));
      const malformed = await verifyMembershipCredentialToken("AA==");
      setResult({
        active: active.valid,
        verifyOnly: verifyOnly.valid,
        blocked: blocked.reason === CREDENTIAL_REASON.BLOCKED_KEY_ID,
        unknown: unknown.reason === CREDENTIAL_REASON.UNKNOWN_KEY_ID,
        tamper: tampered.reason === CREDENTIAL_REASON.INVALID_SIGNATURE,
        malformed: malformed.reason === CREDENTIAL_REASON.INVALID_ENCODING
      });
    } catch (caught) {
      setError(caught instanceof Error ? `${caught.name}: ${caught.message}` : "Unknown error");
    } finally {
      setRunning(false);
    }
  }

  const overall = result ? Object.values(result).every(Boolean) : false;
  return (
    <section className="panel">
      <h2>Credential v1 production verifier 진단</h2>
      <p className="small">dev/test only. 공개 fixture와 test dependency injection만 사용하며 DB를 변경하지 않습니다.</p>
      <button className="action-button" type="button" onClick={run} disabled={running}>
        {running ? "검증 중…" : "런타임 검증 실행"}
      </button>
      <dl className="diag-grid poc-results" aria-live="polite">
        <dt>active key verify</dt><dd>{result ? pass(result.active) : "미실행"}</dd>
        <dt>verify-only key verify</dt><dd>{result ? pass(result.verifyOnly) : "미실행"}</dd>
        <dt>blocked key reject</dt><dd>{result ? pass(result.blocked) : "미실행"}</dd>
        <dt>unknown key reject</dt><dd>{result ? pass(result.unknown) : "미실행"}</dd>
        <dt>payload tamper reject</dt><dd>{result ? pass(result.tamper) : "미실행"}</dd>
        <dt>malformed encoding reject</dt><dd>{result ? pass(result.malformed) : "미실행"}</dd>
        <dt>overall</dt><dd className={overall ? "status-ok" : result ? "status-warn" : undefined}>{result ? pass(overall) : "미실행"}</dd>
      </dl>
      {error ? <p className="status-warn" role="alert">{error}</p> : null}
    </section>
  );
}
