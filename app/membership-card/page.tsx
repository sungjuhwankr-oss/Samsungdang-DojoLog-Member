import { MembershipCard } from "../components/membership-card";
import { PageHeader } from "../components/page-header";
import { SamsungdangFeatureBoundary } from "../components/samsungdang-feature-boundary";
import { SAMSUNGDANG_FEATURE } from "../membership-gate.mjs";

export default function MembershipCardPage() {
  return (
    <main className="shell">
      <PageHeader title="회원증" />
      <SamsungdangFeatureBoundary
        feature={SAMSUNGDANG_FEATURE.MEMBERSHIP_CARD}
        fallback={<section className="panel"><p className="status-warn" role="status">요청한 화면을 현재 사용할 수 없습니다.</p></section>}
      >
        <MembershipCard />
      </SamsungdangFeatureBoundary>
    </main>
  );
}
