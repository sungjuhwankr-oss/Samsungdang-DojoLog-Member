import { BackupRestorePanel } from "./components/backup-restore-panel";
import { Diagnostics } from "./components/diagnostics";
import { MemberPanel } from "./components/member-panel";
import { TrainingLog } from "./components/training-log";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export default function Home() {
  return (
    <main className="shell">
      <header className="brand">
        <h1>Samsungdang DojoLog - 수련자</h1>
        <p>개인 아이키도 수련기록 PWA · 수련 진행과 심사 카타 분석</p>
      </header>

      <section className="panel">
        <h2>현재 단계</h2>
        <p>
          개인수련과 공유수업을 수련일지로 기록·수정하고, 메모와 공유 원본을
          확인할 수 있습니다. 현재 일지를 기준으로 수련 진행과 심사 카타를 분석합니다.
        </p>
        <p className="small">
          이 분석은 심사 응시나 합격 가능성을 판정하지 않습니다. 실제 심사 시기는
          지도자의 판단에 따라 달라질 수 있습니다.
        </p>
        <a className="cta" href={`${basePath}/import/#session=test123`}>
          import 연결 테스트
        </a>
      </section>

      <MemberPanel />
      <TrainingLog />
      <BackupRestorePanel />
      <Diagnostics />
    </main>
  );
}
