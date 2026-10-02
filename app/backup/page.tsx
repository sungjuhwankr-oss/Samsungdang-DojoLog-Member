import { BackupRestorePanel } from "../components/backup-restore-panel";
import { Diagnostics } from "../components/diagnostics";
import { PageHeader } from "../components/page-header";

export default function BackupPage() {
  return (
    <main className="shell">
      <PageHeader title="백업" description="Backup v1 파일을 만들거나 복원합니다." />
      <BackupRestorePanel />
      <Diagnostics />
    </main>
  );
}
