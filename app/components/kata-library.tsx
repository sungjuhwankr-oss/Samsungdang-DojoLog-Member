"use client";

import { useEffect, useMemo, useState } from "react";

import kataCatalog from "../../reference/kata-catalog.v2.json";
import {
  createExamTable,
  getCurrentKataPresentation,
  getKataExamLabels,
  groupKataByCategory,
  KATA_CATEGORIES,
  type CanonicalKata
} from "../kata-library.mjs";

type View = "library" | "exam";

function videoLabel(label: string | undefined, multiple: boolean) {
  if (!multiple) return "영상 보기";
  return `영상 보기${label ? ` (${label})` : ""}`;
}

function KataDetail({ kata, openExam }: { kata: CanonicalKata; openExam(anchor: string): void }) {
  const presentation = getCurrentKataPresentation(kataCatalog, kata.id);
  const examLabels = getKataExamLabels(kata);
  return (
    <details className="kata-detail" id={`kata-${kata.id}`}>
      <summary>
        <strong>{kata.nameKo}</strong>
        {examLabels.length > 0 && <span>{examLabels.join(" · ")}</span>}
      </summary>
      <dl className="kata-metadata">
        <dt>자세</dt><dd>{kata.form}</dd>
        <dt>공격</dt><dd>{kata.attack}</dd>
        <dt>기술</dt><dd>{kata.technique}</dd>
      </dl>
      {presentation.status === "video" ? (
        <div className="video-link-list">
          {presentation.links.map((link) => (
            <a key={`${link.url}-${link.label ?? ""}`} className="secondary-button" href={link.url} target="_blank" rel="noreferrer">
              {videoLabel(link.label, presentation.links.length > 1)}
            </a>
          ))}
        </div>
      ) : <p className="video-unavailable">영상 없음</p>}
      {kata.examEntries.length > 0 && (
        <div className="exam-link-list" aria-label="삼성당 심사표 연결">
          {kata.examEntries.map((entry) => {
            const label = entry.track === "kyu" ? `${entry.grade}급` : "유단자용";
            const anchor = entry.track === "kyu" ? `exam-grade-${entry.grade}` : "exam-dan";
            return <button key={`${entry.track}-${entry.grade ?? "dan"}`} type="button" onClick={() => openExam(anchor)}>{label} 심사항목</button>;
          })}
        </div>
      )}
    </details>
  );
}

export function KataLibrary() {
  const [view, setView] = useState<View>("library");
  const [category, setCategory] = useState(KATA_CATEGORIES[0].id);
  const [pendingAnchor, setPendingAnchor] = useState<string | null>(null);
  const groups = useMemo(() => groupKataByCategory(kataCatalog), []);
  const examTable = useMemo(() => createExamTable(kataCatalog), []);
  const currentGroup = groups.find((group) => group.id === category) ?? groups[0];

  useEffect(() => {
    if (view !== "exam" || !pendingAnchor) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(pendingAnchor)?.scrollIntoView({ behavior: "smooth", block: "start" });
      setPendingAnchor(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [pendingAnchor, view]);

  function openExam(anchor: string) {
    setView("exam");
    setPendingAnchor(anchor);
  }

  return (
    <section className="panel kata-library-panel">
      <div className="section-tabs" role="tablist" aria-label="카타 화면">
        <button type="button" role="tab" aria-selected={view === "library"} onClick={() => setView("library")}>카타 자료실</button>
        <button type="button" role="tab" aria-selected={view === "exam"} onClick={() => setView("exam")}>삼성당 심사표</button>
      </div>

      {view === "library" ? (
        <div role="tabpanel">
          <p className="small">전체 97개 canonical Kata를 현재 category와 영상·심사 연결 기준으로 표시합니다.</p>
          <div className="category-navigation" aria-label="카타 category">
            {groups.map((group) => (
              <button key={group.id} type="button" aria-pressed={category === group.id} onClick={() => setCategory(group.id)}>
                {group.label} <span>{group.kata.length}</span>
              </button>
            ))}
          </div>
          <section aria-labelledby={`category-${currentGroup.id}`}>
            <h2 id={`category-${currentGroup.id}`}>{currentGroup.label}</h2>
            <div className="kata-detail-list">
              {currentGroup.kata.map((kata) => <KataDetail key={kata.id} kata={kata} openExam={openExam} />)}
            </div>
          </section>
        </div>
      ) : (
        <div role="tabpanel" className="exam-table">
          <h2>삼성당 심사표</h2>
          <p>심사에서는 응시 급까지 앞 급수의 심사항목을 누적하여 확인합니다.</p>
          <p className="small">전체 심사표를 표시하며, 각 급 section으로 바로 이동할 수 있습니다.</p>
          <nav className="exam-anchor-navigation" aria-label="급수 바로가기">
            {examTable.kyu.map((section) => <a key={section.grade} href={`#exam-grade-${section.grade}`}>{section.grade}급</a>)}
            <a href="#exam-dan">유단자용</a>
          </nav>
          {examTable.kyu.map((section) => (
            <section key={section.grade} id={`exam-grade-${section.grade}`} className="exam-section">
              <h3>{section.grade}급</h3>
              <ol>{section.kata.map((kata) => <li key={kata.id}><a href={`#kata-${kata.id}`} onClick={() => setView("library")}>{kata.nameKo}</a></li>)}</ol>
            </section>
          ))}
          <section id="exam-dan" className="exam-section">
            <h3>유단자용</h3>
            <ol>{examTable.dan.map((kata) => <li key={kata.id}>{kata.nameKo}</li>)}</ol>
          </section>
        </div>
      )}
    </section>
  );
}
