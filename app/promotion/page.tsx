import { Diagnostics } from "../components/diagnostics";
import { PromotionRegistrationPanel } from "../components/promotion-registration-panel";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export default function PromotionPage() {
  return (
    <main className="shell">
      <header className="brand">
        <h1>Samsungdang DojoLog - 수련자</h1>
        <p>삼성당 승급·승단 결과 등록</p>
      </header>
      <section className="panel" aria-labelledby="promotion-registration-title">
        <h2 id="promotion-registration-title">Promotion Credential 확인</h2>
        <PromotionRegistrationPanel />
        <p><a href={`${basePath}/`}>홈으로 돌아가기</a></p>
      </section>
      <Diagnostics />
    </main>
  );
}
