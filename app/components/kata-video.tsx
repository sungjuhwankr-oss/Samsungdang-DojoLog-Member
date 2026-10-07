import kataCatalog from "../../reference/kata-catalog.v2.json";
import { getCurrentKataPresentation } from "../kata-library.mjs";
import { kataVideoActions } from "../kata-presentation.mjs";

export function KataVideo({ id }: { id: string }) {
  const presentation = getCurrentKataPresentation(kataCatalog, id);
  if (presentation.status === "unknown") {
    return <span className="kata-video-state unknown">카탈로그 외 기록</span>;
  }
  if (presentation.status === "no-video") {
    return <span className="kata-video-state">영상 없음</span>;
  }
  return (
    <span className="kata-video-actions">
      {kataVideoActions(presentation.links).map((action, index) => (
        <a key={`${action.url}-${index}`} className="secondary-button kata-video-button" href={action.url} target="_blank" rel="noreferrer">
          {action.label}
        </a>
      ))}
    </span>
  );
}
