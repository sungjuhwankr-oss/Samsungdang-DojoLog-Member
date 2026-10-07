import { SAMSUNGDANG_FEATURE } from "./membership-gate.mjs";

export const PRIMARY_NAVIGATION = Object.freeze([
  { href: "/", label: "홈", icon: "home" },
  { href: "/journal/", label: "수련일지", icon: "journal" },
  { href: "/kata/", label: "카타/심사표", icon: "kata" },
  { href: "/events/", label: "행사참여기록", icon: "events" },
  { href: "/beginner-videos/", label: "초심자용 교본", icon: "book" }
]);

export const MORE_NAVIGATION = Object.freeze([
  { href: "/onboarding/", label: "회원 전자 증명서 등록" },
  { href: "/membership-card/", label: "회원증", feature: SAMSUNGDANG_FEATURE.MEMBERSHIP_CARD },
  { href: "/promotion-history/", label: "승단급 이력", feature: SAMSUNGDANG_FEATURE.TRAINING_PROGRESS },
  { href: "/backup/", label: "백업" },
  { href: "/manual/", label: "설명서" }
]);

export function normalizedNavigationPath(pathname, basePath = "") {
  const withoutBase = basePath && (pathname === basePath || pathname.startsWith(`${basePath}/`))
    ? pathname.slice(basePath.length) : pathname;
  if (!withoutBase || withoutBase === "/") return "/";
  return withoutBase.endsWith("/") ? withoutBase : `${withoutBase}/`;
}

// Bind only while the disclosure is open; item/route changes close in React.
export function bindNavigationDismissal(documentTarget, contains, close, focusTrigger) {
  const outside = event => { if (!contains(event.target)) close(); };
  const escape = event => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      focusTrigger();
    }
  };
  documentTarget.addEventListener("pointerdown", outside);
  documentTarget.addEventListener("keydown", escape);
  return () => {
    documentTarget.removeEventListener("pointerdown", outside);
    documentTarget.removeEventListener("keydown", escape);
  };
}
