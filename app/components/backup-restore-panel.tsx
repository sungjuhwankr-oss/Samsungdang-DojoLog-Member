"use client";
import { useState } from "react";
import { BackupValidationError, parseBackupText, validateBackupFileSize } from "../backup.mjs";
import type { MemberBackup } from "../backup.mjs";
import { createIndexedDbBackup, readBackupDataFromIndexedDb, restoreIndexedDbBackup } from "../backup-store";

type Notice = { ok: boolean; text: string } | null;
const message = (error: unknown) => error instanceof BackupValidationError ? error.message : "백업 작업을 완료하지 못했습니다.";
export function BackupRestorePanel() {
  const [notice, setNotice] = useState<Notice>(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("restore") === "success" ? { ok: true, text: "백업 복원이 완료되었습니다. 저장된 데이터를 다시 불러왔습니다." } : null);
  const [preview, setPreview] = useState<MemberBackup | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  async function download() {
    setBusy(true); setNotice(null);
    try {
      const backup = await createIndexedDbBackup();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Samsungdang-DojoLog-Member-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click(); URL.revokeObjectURL(url);
      setNotice({ ok: true, text: "JSON 백업 파일을 만들었습니다." });
    } catch (error) { setNotice({ ok: false, text: message(error) }); }
    finally { setBusy(false); }
  }
  async function choose(file?: File) {
    setPreview(null); setConfirmed(false); setNotice(null);
    if (!file) return;
    setBusy(true);
    try {
      validateBackupFileSize(file.size);
      const text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
      setPreview(parseBackupText(text));
    } catch (error) { setNotice({ ok: false, text: message(error) }); }
    finally { setBusy(false); }
  }
  async function restore() {
    if (!preview || !confirmed) return;
    setBusy(true); setNotice(null);
    try {
      await restoreIndexedDbBackup(preview);
      await readBackupDataFromIndexedDb();
      const url = new URL(window.location.href);
      url.searchParams.set("restore", "success"); url.hash = "";
      window.location.replace(url.toString());
    } catch (error) { setNotice({ ok: false, text: message(error) }); setBusy(false); }
  }
  return <section className="panel">
    <h2>데이터 백업</h2>
    <p>수련기록·내 정보·승급이력을 JSON 파일로 백업합니다. 서버로 전송하지 않습니다.</p>
    <button className="action-button" type="button" onClick={download} disabled={busy}>JSON 백업 파일 만들기</button>
    <h3>전체 복원</h3>
    <p className="status-warn">복원하면 현재 수련기록·내 정보·승급이력이 선택한 백업 내용으로 전체 교체됩니다.</p>
    <input type="file" accept=".json,application/json" disabled={busy} onChange={(event) => choose(event.target.files?.[0])} />
    {preview && <div className="codebox">
      <p><strong>복원 미리보기</strong></p>
      <dl className="diag-grid">
        <dt>백업 생성 시각</dt><dd>{preview.exportedAt}</dd>
        <dt>프로필</dt><dd>{preview.data.memberProfile.length ? "있음" : "없음"}</dd>
        <dt>승급이력</dt><dd>{preview.data.promotionHistory.length}건</dd>
        <dt>수업기록</dt><dd>{preview.data.trainingSession.length}건</dd>
        <dt>kata 기록</dt><dd>{preview.data.sessionKata.length}건</dd>
      </dl>
      <label><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> 전체 교체를 확인했습니다.</label>
      <p><button className="action-button" type="button" onClick={restore} disabled={!confirmed || busy}>복원 실행</button></p>
    </div>}
    {notice && <p className={notice.ok ? "status-ok" : "status-warn"}>{notice.text}</p>}
  </section>;
}

