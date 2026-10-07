export function getScrollControlState(metrics: { scrollTop: number; scrollHeight: number; viewportHeight: number }): { top: boolean; bottom: boolean };
export function scrollToBoundary(target: Window, direction: "top" | "bottom", reducedMotion?: boolean): void;
