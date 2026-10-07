"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { bindNavigationDismissal, MORE_NAVIGATION, normalizedNavigationPath, PRIMARY_NAVIGATION } from "../shell-navigation.mjs";
import { NavigationIcon } from "./navigation-icon";
import { SamsungdangFeatureBoundary } from "./samsungdang-feature-boundary";

export function AppNavigation() {
  const pathname = normalizedNavigationPath(usePathname(), process.env.NEXT_PUBLIC_BASE_PATH ?? "");
  // A route-specific disclosure cannot survive navigation, even through back/forward.
  return <NavigationForRoute key={pathname} pathname={pathname} />;
}

function NavigationForRoute({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const moreActive = MORE_NAVIGATION.some(item => item.href === pathname);

  useEffect(() => {
    if (!open) return;
    return bindNavigationDismissal(document,
      target => target instanceof Node && Boolean(moreRef.current?.contains(target)),
      () => setOpen(false), () => triggerRef.current?.focus());
  }, [open]);

  return (
    <nav className="app-navigation" aria-label="주요 메뉴">
      {PRIMARY_NAVIGATION.map((item) => (
        <Link key={item.href} href={item.href} aria-current={pathname === item.href ? "page" : undefined}>
          <NavigationIcon name={item.icon} />
          <span className="navigation-label">{item.label}</span>
        </Link>
      ))}
      <div className="more-navigation" ref={moreRef}>
        <button ref={triggerRef} type="button" aria-expanded={open} aria-controls="more-navigation-sheet" aria-current={moreActive ? "page" : undefined} onClick={() => setOpen(value => !value)}>
          <NavigationIcon name="more" /><span className="navigation-label">기타</span>
        </button>
        {open && <div className="more-navigation-sheet" id="more-navigation-sheet" aria-label="기타 메뉴">
          {MORE_NAVIGATION.map(item => {
            const link = <Link href={item.href} onClick={() => setOpen(false)} aria-current={pathname === item.href ? "page" : undefined}>{item.label}</Link>;
            return item.feature
              ? <SamsungdangFeatureBoundary key={item.href} feature={item.feature}>{link}</SamsungdangFeatureBoundary>
              : <span key={item.href} className="more-navigation-item">{link}</span>;
          })}
        </div>}
      </div>
    </nav>
  );
}
