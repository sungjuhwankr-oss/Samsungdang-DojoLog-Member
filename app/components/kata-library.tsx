"use client";

import { useEffect, useMemo, useState } from "react";

import kataCatalog from "../../reference/kata-catalog.v2.json";
import {
  createExamTable,
  type CanonicalKata
} from "../kata-library.mjs";
import { groupKataForLibrarySections, groupKataForPresentation, kataExamBadges, KATA_PRESENTATION_GROUPS } from "../kata-presentation.mjs";
import { KataVideo } from "./kata-video";

type View = "library" | "exam";

function KataRow({ kata, openExam }: { kata: CanonicalKata; openExam(anchor: string): void }) {
  return (
    <article className="kata-row" id={`kata-${kata.id}`}>
      <strong className="kata-row-name">{kata.nameKo}</strong>
      <KataVideo id={kata.id} />
      <div className="kata-exam-badges" aria-label="삼성당 심사표 연결">
        {kataExamBadges(kata).map(({ label, anchor }) => anchor
          ? <button key={label} className="kata-exam-badge" type="button" onClick={() => openExam(anchor)}>{label}</button>
          : <span key={label} className="kata-exam-badge outside-exam">{label}</span>)}
      </div>
    </article>
  );
}

export function KataLibrary() {
  const [view, setView] = useState<View>("library");
  const [category, setCategory] = useState(KATA_PRESENTATION_GROUPS[0].id);
  const [pendingAnchor, setPendingAnchor] = useState<string | null>(null);
  const groups = useMemo(() => groupKataForPresentation(kataCatalog), []);
  const examTable = useMemo(() => createExamTable(kataCatalog), []);
  const currentGroup = groups.find((group) => group.id === category) ?? groups[0];
  const currentSections = useMemo(() => groupKataForLibrarySections(currentGroup), [currentGroup]);

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
          <p className="small">전체 97개 카타를 지도자용 본부 카타의 기술별 순서에 따라 표시합니다. 기존 심사표용 검술·장술도 포함됩니다.</p>
          <div className="category-navigation" aria-label="카타 category">
            {groups.map((group) => (
              <button key={group.id} type="button" aria-pressed={category === group.id} onClick={() => setCategory(group.id)}>
                {group.label} <span>{group.kata.length}</span>
              </button>
            ))}
          </div>
          <section aria-labelledby={`category-${currentGroup.id}`}>
            <h2 id={`category-${currentGroup.id}`}>{currentGroup.label} <span className="kata-group-count">{currentGroup.kata.length}개</span></h2>
            <nav className="kata-technique-navigation" aria-label={`${currentGroup.label} 기술별 바로가기`}>
              {currentSections.map((section) => (
                <a key={section.id} href={`#kata-technique-${section.id}`}>{section.label} <span>{section.kata.length}</span></a>
              ))}
            </nav>
            <div className="kata-technique-sections">
              {currentSections.map((section) => (
                <section className="kata-technique-section" id={`kata-technique-${section.id}`} key={section.id}>
                  <h3>{section.label} <span>{section.kata.length}개</span></h3>
                  <div className="kata-row-list">
                    {section.kata.map((kata) => <KataRow key={kata.id} kata={kata} openExam={openExam} />)}
                  </div>
                </section>
              ))}
            </div>
          </section>
        </div>
      ) : (
        <div role="tabpanel" className="exam-table">
          <h2>삼성당 심사표</h2>
          <p>심사에서는 응시 급까지 앞 급수의 심사항목을 누적하여 확인합니다.</p>
          <p className="small">급수를 선택하면 해당 항목으로 이동합니다. 아래 목록은 각 급에서 새로 추가되는 심사항목입니다.</p>
          <nav className="exam-anchor-navigation" aria-label="급수 바로가기">
            {examTable.kyu.map((section) => <a key={section.grade} href={`#exam-grade-${section.grade}`}>{section.grade}급</a>)}
            <a href="#exam-dan">유단자용</a>
          </nav>
          {examTable.kyu.map((section) => (
            <section key={section.grade} id={`exam-grade-${section.grade}`} className="exam-section">
              <h3>{section.grade}급 <span className="exam-grade-count">{section.kata.length}개 항목</span></h3>
              <ol>{section.kata.map((kata) => <li key={kata.id}><div className="exam-kata-row"><div className="exam-kata-details"><span>{kata.nameKo}</span><small>{kata.form} · {kata.attack}</small></div><KataVideo id={kata.id} /></div></li>)}</ol>
            </section>
          ))}
          <section id="exam-dan" className="exam-section">
            <h3>유단자용 <span className="exam-grade-count">{examTable.dan.length}개 항목</span></h3>
            <ol>{examTable.dan.map((kata) => <li key={kata.id}><div className="exam-kata-row"><div className="exam-kata-details"><span>{kata.nameKo}</span><small>{kata.form} · {kata.attack}</small></div><KataVideo id={kata.id} /></div></li>)}</ol>
          </section>
        </div>
      )}
    </section>
  );
}
