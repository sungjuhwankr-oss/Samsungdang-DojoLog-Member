"use client";

import { useEffect, useState } from "react";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
};

export function PwaBootstrap() {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installPromptStatus, setInstallPromptStatus] =
    useState<"received" | "not received">("not received");
  const [controllerStatus, setControllerStatus] =
    useState<"controlled" | "not controlled">("not controlled");
  const [registrationScope, setRegistrationScope] = useState("not registered");
  const [displayMode, setDisplayMode] =
    useState<"standalone" | "browser">("browser");
  const [appInstalled, setAppInstalled] =
    useState<"received" | "not received">("not received");
  const [userChoice, setUserChoice] = useState<
    "accepted" | "dismissed" | "not requested"
  >("not requested");

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    setDisplayMode(standalone ? "standalone" : "browser");

    const updateController = () => {
      setControllerStatus(
        navigator.serviceWorker?.controller ? "controlled" : "not controlled",
      );
    };

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      setInstallPromptStatus("received");
    };

    const onAppInstalled = () => {
      setAppInstalled("received");
      setInstallPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener(
        "controllerchange",
        updateController,
      );

      navigator.serviceWorker
        .register(basePath + "/sw.js", {
          scope: basePath + "/",
        })
        .then((registration) => {
          setRegistrationScope(registration.scope);
          updateController();
        })
        .catch((error) => {
          console.error("Service worker registration failed", error);
        });
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
      navigator.serviceWorker?.removeEventListener(
        "controllerchange",
        updateController,
      );
    };
  }, []);

  const requestInstall = async () => {
    if (!installPrompt) return;

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setUserChoice(choice.outcome);
    setInstallPrompt(null);
  };

  return (
    <section className="panel install-diagnostic" aria-labelledby="install-diagnostic-title">
      <h2 id="install-diagnostic-title">
        Phase 1.1 installability diagnostic
      </h2>
      <p className="small">
        브라우저가 이 PWA에 부여한 설치 상태를 확인하는 임시 진단 정보입니다.
      </p>
      <dl className="diag-grid">
        <dt>beforeinstallprompt</dt>
        <dd>{installPromptStatus}</dd>
        <dt>serviceWorker controller</dt>
        <dd>{controllerStatus}</dd>
        <dt>serviceWorker scope</dt>
        <dd>{registrationScope}</dd>
        <dt>display-mode</dt>
        <dd>{displayMode}</dd>
        <dt>appinstalled event</dt>
        <dd>{appInstalled}</dd>
        <dt>userChoice</dt>
        <dd>{userChoice}</dd>
      </dl>
      {installPrompt ? (
        <button className="cta install-button" type="button" onClick={requestInstall}>
          앱 설치
        </button>
      ) : null}
    </section>
  );
}
