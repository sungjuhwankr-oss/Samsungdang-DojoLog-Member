"use client";

import { useState } from "react";
import { inspectMemberIndexedDb } from "../read-only-inventory.mjs";
import { prepareE3TargetedBackup } from "../e3-targeted-backup.mjs";
import type { E3TargetedBackup } from "../e3-targeted-backup.mjs";
import { deleteExactE3RecordsWithBackup } from "../e3-targeted-cleanup.mjs";

type PreparedDownload = { content: string; bytes: number; sha256: string; filename: string; backup: E3TargetedBackup };

async function sha256Hex(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

export function ReadOnlyInventoryPanel() {
  const [environment, setEnvironment] = useState<"A" | "B">("A");
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState("아직 조회하지 않았습니다.");
  const [busy, setBusy] = useState(false);
  const [prepared, setPrepared] = useState<PreparedDownload | null>(null);
  const [fileVerified, setFileVerified] = useState(false);
  const [deletionConsent, setDeletionConsent] = useState(false);
  const [backupStatus, setBackupStatus] = useState("아직 E3-UX 백업을 준비하지 않았습니다.");

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

  async function prepareBackup() {
    if (busy || environment !== "A") return;
    setPrepared(null);
    setFileVerified(false);
    setDeletionConsent(false);
    setBusy(true);
    setBackupStatus("A 환경의 E3-UX 5건을 읽기 전용으로 확인하고 있습니다.");
    try {
      const backup = await prepareE3TargetedBackup();
      const content = JSON.stringify(backup, null, 2) + "\n";
      const bytes = new TextEncoder().encode(content);
      const sha256 = await sha256Hex(bytes);
      const date = backup.exportedAt.slice(0, 10).replaceAll("-", "");
      setPrepared({
        content,
        bytes: bytes.byteLength,
        sha256,
        backup,
        filename: `Samsungdang-DojoLog-E3-UX-A-exact5-${date}.json`
      });
      setBackupStatus(`정확한 5건 백업 준비 완료. 파일 크기 ${bytes.byteLength} bytes · SHA-256 ${sha256}. 아직 저장 여부는 확인되지 않았습니다.`);
    } catch (error) {
      setBackupStatus(error instanceof Error ? error.message : "백업 준비 실패. 데이터는 변경하지 않았습니다.");
    } finally {
      setBusy(false);
    }
  }

  function saveBackup() {
    if (busy || !prepared || environment !== "A") return;
    setFileVerified(false);
    setDeletionConsent(false);
    const blob = new Blob([prepared.content], { type: "application/json;charset=utf-8" });
    if (blob.size !== prepared.bytes) {
      setBackupStatus("저장할 파일 크기 검증에 실패했습니다. 저장하지 않았습니다.");
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = prepared.filename;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    setBackupStatus(`파일 다운로드를 요청했습니다. 기기의 다운로드 목록에서 ${prepared.filename} 저장을 확인한 다음 아래의 파일 재검증을 실행하십시오.`);
  }

  async function verifySavedBackup(file?: File) {
    if (!file || !prepared || busy) return;
    setFileVerified(false);
    setDeletionConsent(false);
    setBusy(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const sha256 = await sha256Hex(bytes);
      if (bytes.byteLength !== prepared.bytes || sha256 !== prepared.sha256) {
        setBackupStatus(`저장 파일 불일치. ${file.name} · ${bytes.byteLength} bytes · SHA-256 ${sha256}. 삭제 작업 금지.`);
      } else {
        setFileVerified(true);
        setBackupStatus(`로컬 백업 재검증 PASS · ${file.name} · ${bytes.byteLength} bytes · SHA-256 ${sha256}. PC A에 별도 사본을 보관한 후 삭제를 결정하십시오.`);
      }
    } catch (error) {
      setBackupStatus(error instanceof Error ? error.message : "파일 재검증 실패. 삭제 작업 금지.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteExactFive() {
    if (!prepared || !fileVerified || !deletionConsent || busy || environment !== "A") return;
    const accepted = window.confirm("삼성 인터넷 A의 E3-UX 시험 기록 정확히 5건을 삭제합니다. 별도 백업을 보관하셨습니까? 이 작업은 되돌리기 버튼이 없습니다.");
    if (!accepted) return;
    setBusy(true);
    setBackupStatus("현재 DB와 검증된 백업의 전체 조건을 대조하고 있습니다. 일치할 때만 5건을 원자적으로 삭제합니다.");
    try {
      const result = await deleteExactE3RecordsWithBackup(prepared.backup);
      const inspected = await inspectMemberIndexedDb();
      const postCountsMatch = Object.keys(result.afterCounts).every(store => inspected.counts[store] === result.afterCounts[store]);
      const remainingTarget = inspected.specialTraining.some(row => row.eventId === result.deletedEventId) ||
        inspected.eventParticipation.some(row => row.eventId === result.deletedEventId) ||
        inspected.eventChangeHistory.some(row => row.eventKey === `samsungdang:${result.deletedEventId}`) ||
        inspected.eventMemo.some(row => row.eventKey === `samsungdang:${result.deletedEventId}`);
      setOutput(JSON.stringify({
        ...inspected,
        environment,
        displayModeStandalone: window.matchMedia("(display-mode: standalone)").matches
      }, null, 2));
      setStatus("정밀 삭제 후 읽기 전용 재검사 완료.");
      setPrepared(null);
      setFileVerified(false);
      setDeletionConsent(false);
      if (!postCountsMatch || remainingTarget) {
        setBackupStatus("삭제 트랜잭션 완료 후 읽기 전용 재검증에서 불일치가 발견되었습니다. 추가 작업 중단. 아래 진단 결과를 보존하십시오.");
      } else {
        setBackupStatus(`정밀 삭제 PASS · A에서 정확히 ${result.deletedCount}건 삭제됨. 특별수련 ${result.beforeCounts.specialTrainingHistory}→${result.afterCounts.specialTrainingHistory}, 참가 ${result.beforeCounts.eventParticipation}→${result.afterCounts.eventParticipation}, 변경이력 ${result.beforeCounts.eventChangeHistory}→${result.afterCounts.eventChangeHistory}, 메모 ${result.beforeCounts.eventMemo}→${result.afterCounts.eventMemo}. 다른 저장소 기록 수는 변경되지 않았습니다.`);
      }
    } catch (error) {
      setBackupStatus(error instanceof Error ? error.message : "정밀 삭제 실패. 해당 화면에서 추가 조작하지 마십시오.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel">
    <h2>현재 브라우저 데이터 식별</h2>
    <p>저장소별 기록 수, 인증·행사 ID와 연결된 변경 이력·메모의 키만 조회합니다. 이름, 메모 본문, 변경 전후 원본, 전자 증명서 원문, 개인키는 출력하지 않습니다.</p>
    <p className="status-warn">A(삼성 인터넷)와 B(웨일)에서 각각 설치된 회원용 앱을 실행하여 확인하십시오. 다른 브라우저로 이동하면 같은 데이터가 아닐 수 있습니다.</p>
    <label>현재 환경: <select value={environment} disabled={busy} onChange={event => {
      setEnvironment(event.target.value === "B" ? "B" : "A");
      setPrepared(null);
      setFileVerified(false);
      setDeletionConsent(false);
      setBackupStatus("환경이 변경되었습니다. 이전에 준비한 백업을 폐기했습니다.");
    }}>
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
    <h2>E3-UX 시험 기록 5건 백업·정밀 삭제</h2>
    <p>삼성 인터넷 A에서만 사용합니다. 아래 5건을 정확히 확인하고 JSON 파일에 보존한 후 별도 승인 버튼으로 삭제합니다: 특별수련 1건, 참가 1건, 변경이력 2건, 메모 1건. 기존 4J 특별수련, 외부행사·변경이력 3건, 기타 회원 기록 및 웨일 B는 대상이 아닙니다.</p>
    <p className="status-warn">백업 파일에는 서명된 전자 증명서 원문과 개인 메모 본문이 포함됩니다. 파일을 채팅·이메일·공개 저장소에 올리지 마십시오. 다운로드한 파일을 Fold8과 PC A의 별도 안전한 위치에 보관해야 복구 가능성이 확보됩니다.</p>
    <p><button type="button" className="action-button" onClick={prepareBackup} disabled={busy || environment !== "A"}>1. E3-UX 5건 백업 준비(읽기 전용)</button></p>
    {prepared && environment === "A" && <>
      <p><button type="button" className="action-button" onClick={saveBackup} disabled={busy}>2. 백업 JSON 파일 저장</button></p>
      <label>3. 저장한 JSON 파일 재검증 <input type="file" accept=".json,application/json" disabled={busy} onChange={event => { void verifySavedBackup(event.target.files?.[0]); }} /></label>
      <p>기대 SHA-256: <code style={{ overflowWrap: "anywhere" }}>{prepared.sha256}</code></p>
      {fileVerified && <>
        <label><input type="checkbox" checked={deletionConsent} disabled={busy} onChange={event => setDeletionConsent(event.target.checked)} /> 백업 파일을 별도 위치에 보관했고, E3-UX 시험 기록 5건만 삭제하는 데 동의합니다.</label>
        <p><button type="button" className="action-button" onClick={() => { void deleteExactFive(); }} disabled={busy || !deletionConsent}>4. 정확한 5건만 정밀 삭제</button></p>
      </>}
    </>}
    <p role="status">{backupStatus}</p>
    <p>백업 준비·파일 검증 중에는 DB를 변경하지 않습니다. 삭제 버튼을 직접 확인해 누를 때에만 한 번의 트랜잭션으로 대상 5건을 삭제합니다. 조건 불일치 시 트랜잭션을 취소합니다.</p>
  </section>;
}
