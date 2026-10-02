import beginnerVideos from "../../reference/beginner-videos.v1.json";
import { getBeginnerVideoLevel } from "../kata-library.mjs";

export function BeginnerVideoLibrary() {
  return (
    <section className="panel" aria-labelledby="beginner-library-title">
      <h2 id="beginner-library-title">초심자 동영상</h2>
      <p className="small">목록의 제목·번호·순서와 연결주소는 제공된 원문을 그대로 사용합니다.</p>
      <ol className="beginner-video-list">
        {beginnerVideos.videos.map((video, index) => {
          const level = getBeginnerVideoLevel(video.title);
          return (
            <li key={`${index}-${video.url}`} className={`beginner-video-${level}`}>
              <a href={video.url} target="_blank" rel="noreferrer">{video.title}</a>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
