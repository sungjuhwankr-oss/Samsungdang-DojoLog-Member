import { PageHeader } from "../components/page-header";
import { EventManager } from "../components/event-manager";

export default function EventsPage() {
  return (
    <main className="shell">
      <PageHeader title="행사" description="특별수련과 외부행사 기록 영역입니다." />
      <EventManager />
    </main>
  );
}
