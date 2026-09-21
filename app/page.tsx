import { BackupRestorePanel } from "./components/backup-restore-panel";
import { Diagnostics } from "./components/diagnostics";
import { MemberPanel } from "./components/member-panel";
import { MembershipCard } from "./components/membership-card";
import { SamsungdangFeatureBoundary } from "./components/samsungdang-feature-boundary";
import { TrainingLog } from "./components/training-log";
import { TrainingSummary } from "./components/training-summary";
import { SAMSUNGDANG_FEATURE } from "./membership-gate.mjs";

export default function Home() {
  return (
    <main className="shell">
      <header className="brand">
        <h1>Samsungdang DojoLog - 수련자</h1>
        <p>개인 아이키도 수련기록 PWA</p>
      </header>

      <section className="panel">
        <h2>현재 단계</h2>
        <p>
          개인수련을 수련일지로 기록·수정하고, 메모와 수련기록을 확인할 수 있습니다.
        </p>
        <p className="small">
          수련기록은 이 기기에 저장되며, 서버로 전송하지 않습니다.
        </p>
      </section>

      <TrainingLog />
      <TrainingSummary />
      <SamsungdangFeatureBoundary feature={SAMSUNGDANG_FEATURE.MEMBERSHIP_CARD}>
        <MembershipCard />
      </SamsungdangFeatureBoundary>
      <SamsungdangFeatureBoundary feature={SAMSUNGDANG_FEATURE.TRAINING_PROGRESS}>
        <MemberPanel />
      </SamsungdangFeatureBoundary>
      <BackupRestorePanel />
      <Diagnostics />
    </main>
  );
}
