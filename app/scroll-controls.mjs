export function getScrollControlState({ scrollTop, scrollHeight, viewportHeight }) {
  const range = Math.max(0, scrollHeight - viewportHeight);
  if (range <= Math.max(240, viewportHeight * 0.5)) return { top: false, bottom: false };
  const position = Math.max(0, Math.min(scrollTop, range));
  return { top: position > 48, bottom: range - position > 48 };
}

export function scrollToBoundary(target, direction, reducedMotion = false) {
  const height = Math.max(target.document.documentElement.scrollHeight, target.document.body.scrollHeight);
  target.scrollTo({ top: direction === "top" ? 0 : height, behavior: reducedMotion ? "instant" : "smooth" });
}
