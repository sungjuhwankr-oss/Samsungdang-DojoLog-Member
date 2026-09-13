import { Diagnostics } from "../components/diagnostics";
import { FragmentProbe } from "../components/fragment-probe";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export default function ImportPage() {
  return (
    <main className="shell">
      <header className="brand">
        <h1>Samsungdang DojoLog - 수련자</h1>
        <p>수련기록 가져오기</p>
      </header>

      <section className="panel">
        <h2>수련기록 가져오기</h2>
        <p>현재는 연결 테스트 단계입니다.</p>
        <FragmentProbe />
        <p className="small">
          이 단계에서는 fragment를 표시만 하며 base64url decode, JSON parse, schema validation 또는 저장을 수행하지 않습니다.
        </p>
        <a href={`${basePath}/`}>홈으로 돌아가기</a>
      </section>

      <Diagnostics />
    </main>
  );
}
