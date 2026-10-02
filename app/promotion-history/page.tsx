import { MemberPanel } from "../components/member-panel";
import { PageHeader } from "../components/page-header";
import { SamsungdangFeatureBoundary } from "../components/samsungdang-feature-boundary";
import { SAMSUNGDANG_FEATURE } from "../membership-gate.mjs";

export default function PromotionHistoryPage() {
  return (
    <main className="shell">
      <PageHeader title="승단급 이력" description="현재 단급, 이력과 현급 수련횟수를 확인합니다." />
      <SamsungdangFeatureBoundary
        feature={SAMSUNGDANG_FEATURE.TRAINING_PROGRESS}
        fallback={<section className="panel"><p className="status-warn" role="status">요청한 화면을 현재 사용할 수 없습니다.</p></section>}
      >
        <MemberPanel />
      </SamsungdangFeatureBoundary>
    </main>
  );
}
