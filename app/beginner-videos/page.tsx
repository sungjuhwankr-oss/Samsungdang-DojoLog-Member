import { BeginnerVideoLibrary } from "../components/beginner-video-library";
import { PageHeader } from "../components/page-header";

export default function BeginnerVideosPage() {
  return (
    <main className="shell">
      <PageHeader title="초심자 동영상" description="초심자를 위한 기본 동작과 대인 기술 자료입니다." />
      <BeginnerVideoLibrary />
    </main>
  );
}
