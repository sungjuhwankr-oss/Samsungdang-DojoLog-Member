import { KataLibrary } from "../components/kata-library";
import { PageHeader } from "../components/page-header";

export default function KataPage() {
  return (
    <main className="shell">
      <PageHeader title="카타" description="카타 자료실과 삼성당 전체 심사표입니다." />
      <KataLibrary />
    </main>
  );
}
