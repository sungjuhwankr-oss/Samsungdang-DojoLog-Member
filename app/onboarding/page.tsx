import { Diagnostics } from "../components/diagnostics";
import { OnboardingRegistrationPanel } from "../components/onboarding-registration-panel";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export default function OnboardingPage() {
  return <main className="shell">
    <header className="brand"><h1>Samsungdang DojoLog - 수련자</h1><p>기존 회원 onboarding</p></header>
    <section className="panel" aria-labelledby="onboarding-title">
      <h2 id="onboarding-title">Identity · verified rank · reference baseline</h2>
      <OnboardingRegistrationPanel />
      <p><a href={`${basePath}/`}>홈으로 돌아가기</a></p>
    </section>
    <Diagnostics />
  </main>;
}
