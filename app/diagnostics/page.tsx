import { PageHeader } from "../components/page-header";
import { ReadOnlyInventoryPanel } from "../components/read-only-inventory-panel";

export default function ReadOnlyDiagnosticsPage() {
  return <main className="shell">
    <PageHeader title="데이터 진단" description="Phase 4K-E 읽기 전용 검사" />
    <ReadOnlyInventoryPanel />
  </main>;
}
