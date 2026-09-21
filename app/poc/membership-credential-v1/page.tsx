import { MembershipCredentialDiagnostic } from "./membership-credential-diagnostic";

export default function MembershipCredentialDiagnosticPage() {
  return (
    <main className="shell">
      <header className="brand">
        <h1>Phase 4H-B Membership Credential v1</h1>
        <p>Fold8 runtime validation / dev/test only</p>
      </header>
      <MembershipCredentialDiagnostic />
    </main>
  );
}
