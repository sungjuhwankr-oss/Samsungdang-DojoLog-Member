import { PageHeader } from "../components/page-header";
import { SpecialTrainingHistory } from "../components/special-training-history";

export default function EventsPage() {
  return (
    <main className="shell">
      <PageHeader title="행사" description="특별수련과 외부행사 기록 영역입니다." />
      <section className="panel">
        <h2>현재 제공 범위</h2>
        <p>기존 Samsungdang 특별수련 이력을 읽기 전용으로 표시합니다.</p>
        <p className="small">참가 session 선택, 외부행사 기록과 행사 메모는 아직 지원하지 않습니다.</p>
      </section>
      <SpecialTrainingHistory />
    </main>
  );
}
