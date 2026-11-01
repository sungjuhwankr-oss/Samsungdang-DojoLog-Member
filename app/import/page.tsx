import { FragmentProbe } from "../components/fragment-probe";
import { SamsungdangFeatureBoundary } from "../components/samsungdang-feature-boundary";
import { SAMSUNGDANG_FEATURE } from "../membership-gate.mjs";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export default function ImportPage() {
  return (
    <main className="shell">
      <header className="brand">
        <h1>Samsungdang DojoLog - 수련자</h1>
        <p>수련기록 가져오기</p>
      </header>

      <section className="panel">
        <SamsungdangFeatureBoundary
          feature={SAMSUNGDANG_FEATURE.SESSION_SHARE_IMPORT}
          fallback={
            <div role="status">
              <p className="status-warn">요청한 화면을 현재 사용할 수 없습니다.</p>
              <p>현재 브라우저에서 검증된 회원 전자 증명서를 확인하지 못했습니다. 수련기록 링크는 회원 등록이 확인된 브라우저에서 열어야 합니다.</p>
              <p className="small">다른 브라우저나 설치된 앱에서 이미 회원증을 사용하고 있다면 그 환경에서 링크를 열어 보십시오. 기존 앱 데이터는 삭제하지 마십시오.</p>
            </div>
          }
        >
          <>
            <h2>수련기록 가져오기</h2>
            <p>
              Session Share Payload v1을 검증한 뒤 사용자가 선택한 경우에만
              IndexedDB 수련일지에 추가합니다.
            </p>
            <FragmentProbe />
            <p className="small">
              fragment는 브라우저 안에서만 처리되며 서버로 전송하지 않습니다.
            </p>
          </>
        </SamsungdangFeatureBoundary>
        <a href={`${basePath}/`}>홈으로 돌아가기</a>
      </section>

    </main>
  );
}
