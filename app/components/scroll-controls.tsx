"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { getScrollControlState, scrollToBoundary } from "../scroll-controls.mjs";

export function ScrollControls() {
  const pathname = usePathname();
  const [controls, setControls] = useState({ top: false, bottom: false });

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const nav = document.querySelector(".app-navigation");
      if (nav) document.documentElement.style.setProperty("--navigation-space", `${Math.max(0, window.innerHeight - nav.getBoundingClientRect().top)}px`);
      const next = getScrollControlState({
        scrollTop: window.scrollY,
        scrollHeight: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
        viewportHeight: document.documentElement.clientHeight
      });
      setControls(previous => previous.top === next.top && previous.bottom === next.bottom ? previous : next);
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule);
    const main = document.querySelector("main");
    const nav = document.querySelector(".app-navigation");
    if (main) observer.observe(main);
    if (nav) observer.observe(nav, { box: "border-box" });
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    schedule();
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [pathname]);

  const move = (direction: "top" | "bottom") => scrollToBoundary(window, direction, window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  if (!controls.top && !controls.bottom) return null;
  return <div className="scroll-controls" role="group" aria-label="화면 이동">
    {controls.top && <button type="button" onClick={() => move("top")}>맨 위 ↑</button>}
    {controls.bottom && <button type="button" onClick={() => move("bottom")}>맨 아래 ↓</button>}
  </div>;
}
