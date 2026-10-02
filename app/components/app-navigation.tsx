"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { SAMSUNGDANG_FEATURE } from "../membership-gate.mjs";
import { SamsungdangFeatureBoundary } from "./samsungdang-feature-boundary";

const primary = [
  { href: "/", label: "홈" },
  { href: "/journal/", label: "수련일지" },
  { href: "/kata/", label: "카타" },
  { href: "/events/", label: "행사" }
];

const secondaryPaths = ["/beginner-videos/", "/membership-card/", "/promotion-history/", "/backup/"];

function normalizedPath(pathname: string) {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const withoutBase = basePath && pathname.startsWith(basePath)
    ? pathname.slice(basePath.length)
    : pathname;
  if (!withoutBase || withoutBase === "/") return "/";
  return withoutBase.endsWith("/") ? withoutBase : `${withoutBase}/`;
}

export function AppNavigation() {
  const pathname = normalizedPath(usePathname());
  const moreActive = secondaryPaths.includes(pathname);

  return (
    <nav className="app-navigation" aria-label="주요 메뉴">
      {primary.map((item) => (
        <Link key={item.href} href={item.href} aria-current={pathname === item.href ? "page" : undefined}>
          {item.label}
        </Link>
      ))}
      <details className="more-navigation">
        <summary aria-current={moreActive ? "page" : undefined}>전체</summary>
        <div className="more-navigation-sheet">
          <Link href="/beginner-videos/">초심자 동영상</Link>
          <SamsungdangFeatureBoundary feature={SAMSUNGDANG_FEATURE.MEMBERSHIP_CARD}>
            <Link href="/membership-card/">회원증</Link>
          </SamsungdangFeatureBoundary>
          <SamsungdangFeatureBoundary feature={SAMSUNGDANG_FEATURE.TRAINING_PROGRESS}>
            <Link href="/promotion-history/">승단급 이력</Link>
          </SamsungdangFeatureBoundary>
          <Link href="/backup/">백업</Link>
        </div>
      </details>
    </nav>
  );
}
