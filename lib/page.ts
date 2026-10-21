/** Stable page identity for scoping chat sessions (no hash). */
export function getPageKey(href = location.href): string {
  try {
    const url = new URL(href);
    return `${url.origin}${url.pathname}${url.search}`;
  } catch {
    return href.split('#')[0] ?? href;
  }
}
