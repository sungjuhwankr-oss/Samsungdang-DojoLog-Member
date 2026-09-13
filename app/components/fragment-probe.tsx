"use client";

import { useEffect, useState } from "react";

function readSessionFragment(): string | null {
  if (typeof window === "undefined") return null;
  const raw = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  return params.get("session");
}

export function FragmentProbe() {
  const [session, setSession] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const update = () => {
      setSession(readSessionFragment());
      setReady(true);
    };

    update();
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);

  if (!ready) {
    return <p className="small">fragment 확인 중…</p>;
  }

  if (!session) {
    return (
      <p className="status-warn">
        session fragment not detected. Phase 1에서는 오류가 아니라 진단 상태입니다.
      </p>
    );
  }

  return (
    <>
      <p className="status-ok">session fragment detected:</p>
      <div className="codebox" data-testid="session-fragment">{session}</div>
    </>
  );
}
