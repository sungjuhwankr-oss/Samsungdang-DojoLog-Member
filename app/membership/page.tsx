import { Diagnostics } from "../components/diagnostics";
import { MembershipRegistrationPanel } from "../components/membership-registration-panel";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export default function MembershipPage() {
  return (
    <main className="shell">
      <header className="brand">
        <h1>Samsungdang DojoLog - 수련자</h1>
        <p>삼성당 회원정보 등록</p>
      </header>

      <section className="panel" aria-labelledby="membership-registration-title">
        <h2 id="membership-registration-title">Membership Credential 확인</h2>
        <MembershipRegistrationPanel />
        <p><a href={`${basePath}/`}>홈으로 돌아가기</a></p>
      </section>

      <Diagnostics />
    </main>
  );
}
