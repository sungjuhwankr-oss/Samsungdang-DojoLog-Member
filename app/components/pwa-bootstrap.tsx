"use client";

import { useEffect, useState } from "react";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export function PwaBootstrap() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [displayMode, setDisplayMode] = useState(() => typeof window !== "undefined" && window.matchMedia("(display-mode: standalone)").matches);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const displayModeQuery = window.matchMedia("(display-mode: standalone)");
    const onDisplayModeChange = (event: MediaQueryListEvent) => setDisplayMode(event.matches);
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const onAppInstalled = () => setInstallPrompt(null);
    displayModeQuery.addEventListener("change", onDisplayModeChange);
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register(basePath + "/sw.js", { scope: basePath + "/" })
        .catch(error => console.error("Service worker registration failed", error));
    }
    return () => {
      displayModeQuery.removeEventListener("change", onDisplayModeChange);
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  const requestInstall = async () => {
    if (!installPrompt) return;
    try {
      await installPrompt.prompt();
      await installPrompt.userChoice;
      setInstallPrompt(null);
      setNotice("");
    } catch {
      setNotice("앱 설치를 완료하지 못했습니다. 브라우저 메뉴에서 다시 시도하십시오.");
    }
  };

  if (!installPrompt || displayMode) return null;
  return <section className="panel install-panel" aria-label="앱 설치">
    <button className="cta install-button" type="button" onClick={requestInstall}>앱 설치</button>
    {notice && <p className="status-warn" role="status">{notice}</p>}
  </section>;
}
