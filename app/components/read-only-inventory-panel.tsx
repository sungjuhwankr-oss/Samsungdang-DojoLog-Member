"use client";

import { useState } from "react";
import { inspectMemberIndexedDb } from "../read-only-inventory.mjs";

export function ReadOnlyInventoryPanel() {
  const [environment, setEnvironment] = useState<"A" | "B">("A");
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState("아직 조회하지 않았습니다.");
  const [busy, setBusy] = useState(false);

  async function inspect() {
    if (busy) return;
    setBusy(true);
    setOutput("");
    setStatus("이 기기의 회원용 데이터를 읽기 전용으로 확인 중입니다.");
    try {
      const report = await inspectMemberIndexedDb();
      const result = JSON.stringify({
        ...report,
        environment,
        displayModeStandalone: window.matchMedia("(display-mode: standalone)").matches
      }, null, 2);
      setOutput(result);
      setStatus("조회 완료. 데이터 저장·변경·삭제 없음.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "조회 실패. 데이터는 변경하지 않았습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setStatus("조회 결과를 복사했습니다. 데이터 변경 없음.");
    } catch {
      setStatus("자동 복사를 지원하지 않습니다. 아래 내용을 직접 선택하여 복사하십시오.");
    }
  }

  return <section className="panel">
    <h2>현재 브라우저 데이터 식별</h2>
    <p>저장소별 기록 수, 인증·행사 ID와 연결된 변경 이력·메모의 키만 조회합니다. 이름, 메모 본문, 변경 전후 원본, 전자 증명서 원문, 개인키는 출력하지 않습니다.</p>
    <p className="status-warn">A(삼성 인터넷)와 B(웨일)에서 각각 설치된 회원용 앱을 실행하여 확인하십시오. 다른 브라우저로 이동하면 같은 데이터가 아닐 수 있습니다.</p>
    <label>현재 환경: <select value={environment} disabled={busy} onChange={event => setEnvironment(event.target.value === "B" ? "B" : "A")}>
      <option value="A">A · 삼성 인터넷</option>
      <option value="B">B · 네이버 웨일</option>
    </select></label>
    <p><button type="button" className="action-button" onClick={inspect} disabled={busy}>
      {busy ? "조회 중…" : "읽기 전용 데이터 검사"}
    </button></p>
    <p role="status">{status}</p>
    {output && <>
      <p><button type="button" className="action-button" onClick={copy}>조회 결과 복사</button></p>
      <pre className="codebox" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: "55vh", overflow: "auto" }}>{output}</pre>
    </>}
  </section>;
}
