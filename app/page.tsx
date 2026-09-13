import { Diagnostics } from "./components/diagnostics";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export default function Home() {
  return (
    <main className="shell">
      <header className="brand">
        <h1>Samsungdang DojoLog - 수련자</h1>
        <p>개인 아이키도 수련기록 PWA · Phase 1 기반 검증</p>
      </header>

      <section className="panel">
        <h2>현재 단계</h2>
        <p>
          공개 PWA 진입점, 설치 기반, <code>/import/</code> 경로와 URL fragment 전달을 검증하는 단계입니다.
        </p>
        <p className="small">
          수련기록 저장, Session Share Payload decode/validation, 회원정보와 통계는 아직 구현하지 않았습니다.
        </p>
        <a className="cta" href={`${basePath}/import/#session=test123`}>
          import 연결 테스트
        </a>
      </section>

      <Diagnostics />
    </main>
  );
}
