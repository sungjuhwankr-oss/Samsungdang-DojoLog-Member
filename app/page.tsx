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
        <p>개인 아이키도 수련기록 PWA · Phase 4A 데이터 모델 검증</p>
      </header>

      <section className="panel">
        <h2>현재 단계</h2>
        <p>
          기존 수련기록을 보존하면서 회원 프로필과 승급이력을
          IndexedDB에 추가하는 최소 데이터 모델 검증 단계입니다.
        </p>
        <p className="small">
          수련 통계, 검색, 수정·삭제, backup/restore는 구현하지 않았습니다.
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
