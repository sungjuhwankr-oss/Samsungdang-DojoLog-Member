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
        <p>Session Share Payload v1을 검증해 저장 없이 미리보기합니다.</p>
        <FragmentProbe />
        <p className="small">
          fragment는 브라우저 안에서만 처리되며 서버로 전송하거나 수련일지에
          저장하지 않습니다.
        </p>
        <a href={`${basePath}/`}>홈으로 돌아가기</a>
      </section>

      <Diagnostics />
    </main>
  );
}
