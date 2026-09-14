import { Diagnostics } from "./components/diagnostics";
import { TrainingLog } from "./components/training-log";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export default function Home() {
  return (
    <main className="shell">
      <header className="brand">
        <h1>Samsungdang DojoLog - 수련자</h1>
        <p>개인 아이키도 수련기록 PWA · Phase 3 저장 검증</p>
      </header>

      <section className="panel">
        <h2>현재 단계</h2>
        <p>
          검증된 Session Share Payload v1을 IndexedDB에 저장하고
          홈에서 같은 기록을 확인하는 최소 검증 단계입니다.
        </p>
        <p className="small">
          회원정보, 승급이력, 통계, 검색, 수정·삭제, backup/restore는 구현하지 않았습니다.
        </p>
        <a className="cta" href={`${basePath}/import/#session=test123`}>
          import 연결 테스트
        </a>
      </section>

      <TrainingLog />
      <Diagnostics />
    </main>
  );
}
