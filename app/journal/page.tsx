import { PageHeader } from "../components/page-header";
import { TrainingLog } from "../components/training-log";

export default function JournalPage() {
  return (
    <main className="shell">
      <PageHeader title="수련일지" description="일반 수련기록과 메모를 관리합니다." />
      <TrainingLog />
    </main>
  );
}
