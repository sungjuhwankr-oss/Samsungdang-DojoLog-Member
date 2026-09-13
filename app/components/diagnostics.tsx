"use client";

import { useEffect, useState } from "react";

type DiagnosticsState = {
  href: string;
  origin: string;
  pathname: string;
  hash: string;
  displayMode: string;
  standalone: string;
  serviceWorker: string;
  basePath: string;
  userAgent: string;
};

const initial: DiagnosticsState = {
  href: "client pending",
  origin: "client pending",
  pathname: "client pending",
  hash: "client pending",
  displayMode: "client pending",
  standalone: "client pending",
  serviceWorker: "client pending",
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || "(root)",
  userAgent: "client pending",
};

export function Diagnostics() {
  const [state, setState] = useState<DiagnosticsState>(initial);

  useEffect(() => {
    let cancelled = false;

    const update = async () => {
      const standaloneMatch = window.matchMedia("(display-mode: standalone)").matches;
      const iosStandalone = Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
      let serviceWorker = "unsupported";

      if ("serviceWorker" in navigator) {
        try {
          const registration = await navigator.serviceWorker.getRegistration();
          serviceWorker = registration
            ? `registered (${registration.scope})`
            : "supported, not registered yet";
        } catch {
          serviceWorker = "supported, status unavailable";
        }
      }

      if (!cancelled) {
        setState({
          href: window.location.href,
          origin: window.location.origin,
          pathname: window.location.pathname,
          hash: window.location.hash || "(none)",
          displayMode: standaloneMatch ? "standalone" : "browser",
          standalone: standaloneMatch || iosStandalone ? "yes" : "no",
          serviceWorker,
          basePath: process.env.NEXT_PUBLIC_BASE_PATH || "(root)",
          userAgent: navigator.userAgent,
        });
      }
    };

    update();
    const onControllerChange = () => update();
    navigator.serviceWorker?.addEventListener("controllerchange", onControllerChange);

    return () => {
      cancelled = true;
      navigator.serviceWorker?.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  return (
    <section className="panel" aria-labelledby="diag-title">
      <h2 id="diag-title">연결 진단</h2>
      <p className="small">이 정보는 현재 화면에만 표시되며 서버로 전송하지 않습니다.</p>
      <dl className="diag-grid">
        {Object.entries(state).map(([key, value]) => (
          <div key={key} style={{ display: "contents" }}>
            <dt>{key}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
