"use client";

import { useState } from "react";
import fixture from "./fixtures/android-keystore-4g-a2-public-test-vector.json";
import {
  verifyAndroidKeystorePocVector,
  type AndroidKeystorePocVerificationResult
} from "./web-crypto-poc.mjs";

function pass(value: boolean) {
  return value ? "PASS" : "FAIL";
}

function yesNo(value: boolean) {
  return value ? "yes" : "no";
}

export function CredentialVerifyPanel() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<AndroidKeystorePocVerificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runVerification() {
    setRunning(true);
    setResult(null);
    setError(null);
    try {
      setResult(await verifyAndroidKeystorePocVector(fixture));
    } catch (caught) {
      setError(caught instanceof Error ? `${caught.name}: ${caught.message}` : "Unknown verification error");
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="panel">
      <h2>공개 A2 test vector 검증</h2>
      <p className="small">
        공개키 검증만 수행합니다. private key, credential 저장, membership 활성화 기능은 없습니다.
      </p>
      <button className="action-button" type="button" onClick={runVerification} disabled={running}>
        {running ? "검증 중…" : "4G-B 검증 실행"}
      </button>

      <dl className="diag-grid poc-results" aria-live="polite">
        <dt>Web Crypto available</dt>
        <dd>{result ? pass(result.webCryptoAvailable) : "미실행"}</dd>
        <dt>fixture schema</dt>
        <dd>{fixture.schema}</dd>
        <dt>fixture status</dt>
        <dd>{fixture.pocStatus}</dd>
        <dt>fixture identity</dt>
        <dd>{result ? pass(result.fixtureIdentityPassed) : "미실행"}</dd>
        <dt>UTF-8 bytes identical</dt>
        <dd>{result ? pass(result.utf8BytesIdentical) : "미실행"}</dd>
        <dt>SPKI public key import</dt>
        <dd>{result ? pass(result.spkiPublicKeyImportPassed) : "미실행"}</dd>
        <dt>Android signature byte length</dt>
        <dd>{result?.androidSignatureByteLength ?? fixture.signatureByteLength}</dd>
        <dt>signature representation observed</dt>
        <dd>{result?.signatureRepresentationObserved ?? "미실행"}</dd>
        <dt>DER direct verify</dt>
        <dd>{result ? `${pass(result.directDerVerifyPassed)} (${result.directDerVerifyOutcome})` : "미실행"}</dd>
        <dt>adapter used</dt>
        <dd>{result ? yesNo(result.signatureAdapterUsed) : "미실행"}</dd>
        <dt>adapted signature byte length</dt>
        <dd>{result?.adaptedSignatureByteLength ?? "미실행"}</dd>
        <dt>original verify</dt>
        <dd className={result?.originalVerifyPassed ? "status-ok" : undefined}>
          {result ? pass(result.originalVerifyPassed) : "미실행"}
        </dd>
        <dt>input tamper rejected</dt>
        <dd>{result ? pass(result.inputTamperRejected) : "미실행"}</dd>
        <dt>signature tamper rejected</dt>
        <dd>{result ? pass(result.signatureTamperRejected) : "미실행"}</dd>
        <dt>public-key tamper rejected</dt>
        <dd>{result ? `${pass(result.publicKeyTamperRejected)} (${result.publicKeyTamperOutcome})` : "미실행"}</dd>
        <dt>overall 4G-B</dt>
        <dd className={result?.overallPassed ? "status-ok" : result ? "status-warn" : undefined}>
          {result ? pass(result.overallPassed) : "미실행"}
        </dd>
      </dl>

      {error ? <p className="status-warn" role="alert">검증 실패: {error}</p> : null}
    </section>
  );
}
