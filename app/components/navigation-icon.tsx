import type { NavigationIconName } from "../shell-navigation.mjs";

const paths: Record<NavigationIconName, React.ReactNode> = {
  home: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" /><path d="M9 21v-8h6v8" /></>,
  journal: <><rect x="5" y="3" width="15" height="18" rx="2" /><path d="M3 7h4M3 12h4M3 17h4M10 8h6M10 12h6M10 16h4" /></>,
  kata: <><path d="M4 4h6a2 2 0 0 1 2 2v15a3 3 0 0 0-3-2H4ZM20 4h-6a2 2 0 0 0-2 2v15a3 3 0 0 1 3-2h5Z" /></>,
  events: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18m-13 5 2 2 4-4" /></>,
  book: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5V5a2 2 0 0 1 2-2h14v19H6.5A2.5 2.5 0 0 1 4 19.5Z" /><path d="m10 7 5 3-5 3Z" /></>,
  more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>
};

export function NavigationIcon({ name }: { name: NavigationIconName }) {
  return <svg className="navigation-icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
