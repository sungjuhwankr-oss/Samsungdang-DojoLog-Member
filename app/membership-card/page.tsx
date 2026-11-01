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
        fallback={<section className="panel"><p className="status-warn" role="status">요청한 화면을 현재 사용할 수 없습니다.</p><p>현재 브라우저에 검증된 회원 전자 증명서가 없어 회원증이 표시되지 않습니다. 홈 화면의 회원증 안내 또는 ‘기타 → 회원 전자 증명서 등록’에서 상태를 확인할 수 있습니다.</p></section>}
      >
        <MembershipCard />
      </SamsungdangFeatureBoundary>
    </main>
  );
}
