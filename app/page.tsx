import { Dashboard } from "./components/dashboard";
import { PageHeader } from "./components/page-header";

export default function Home() {
  return (
    <main className="shell dashboard-shell">
      <PageHeader title="홈" description="수련기록과 삼성당 자료를 요약해서 확인합니다." />
      <Dashboard />
    </main>
  );
}
