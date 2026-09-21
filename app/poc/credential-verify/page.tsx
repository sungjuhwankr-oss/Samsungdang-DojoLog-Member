import { CredentialVerifyPanel } from "./credential-verify-panel";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export default function CredentialVerifyPocPage() {
  return (
    <main className="shell">
      <header className="brand">
        <h1>Samsungdang DojoLog Member</h1>
        <p>Phase 4G-B Web Crypto Interoperability PoC</p>
      </header>

      <section className="panel">
        <h2>dev/test only</h2>
        <p className="status-warn">candidate-not-credential-v1</p>
        <p>
          Fold8 Android Keystore에서 생성한 공개 Phase 4G-A2 test vector와
          이 PWA runtime의 Web Crypto 상호운용성만 확인합니다.
        </p>
      </section>

      <CredentialVerifyPanel />

      <section className="panel">
        <p className="small">
          이 결과는 Credential v1 규격 확정이나 삼성당 회원 기능 활성화를 의미하지 않습니다.
        </p>
        <a href={`${basePath}/`}>홈으로 돌아가기</a>
      </section>
    </main>
  );
}
