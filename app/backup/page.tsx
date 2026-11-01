import { BackupRestorePanel } from "../components/backup-restore-panel";
import { PageHeader } from "../components/page-header";
import Link from "next/link";

export default function BackupPage() {
  return (
    <main className="shell">
      <PageHeader title="백업" description="Backup v1 파일을 만들거나 복원합니다." />
      <BackupRestorePanel />
      <section className="panel">
        <h2>읽기 전용 데이터 진단</h2>
        <p>Phase 4K-E 시험 데이터 ID와 저장소별 기록 수를 확인합니다. 백업·복원 및 삭제 작업은 수행하지 않습니다.</p>
        <p><Link className="action-button" href="/diagnostics/">데이터 진단 화면 열기</Link></p>
      </section>
    </main>
  );
}
