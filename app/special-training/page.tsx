import { SamsungdangFeatureBoundary } from "../components/samsungdang-feature-boundary";
import { SpecialTrainingHistory } from "../components/special-training-history";
import { SpecialTrainingRegistrationPanel } from "../components/special-training-registration-panel";
import { SAMSUNGDANG_FEATURE } from "../membership-gate.mjs";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export default function SpecialTrainingPage() {
  return (
    <main className="shell">
      <header className="brand">
        <h1>Samsungdang DojoLog - 수련자</h1>
        <p>삼성당 특별수련 이력 등록</p>
      </header>
      <section className="panel" aria-labelledby="special-training-registration-title">
        <h2 id="special-training-registration-title">Special-training Credential 확인</h2>
        <SpecialTrainingRegistrationPanel />
        <p><a href={`${basePath}/`}>홈으로 돌아가기</a></p>
      </section>
      <SamsungdangFeatureBoundary feature={SAMSUNGDANG_FEATURE.SPECIAL_TRAINING_HISTORY}>
        <SpecialTrainingHistory />
      </SamsungdangFeatureBoundary>
    </main>
  );
}
