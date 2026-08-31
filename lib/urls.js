/**
 * URL helpers for the article repetition guard.
 *
 * Kept free of third-party imports so they can be tested with plain node, the
 * same way lib/state.js is.
 */

/** First URL in a block of text, or "" if there is none. */
export function extractUrl(text) {
  return text.match(/https?:\/\/\S+/)?.[0] || "";
}

/**
 * Compare URLs by host and path only. Tracking parameters, fragments, `www.`
 * and trailing slashes all vary between two links to the same article, and a
 * naive string comparison would treat those as different pieces.
 */
export function normalizeUrl(raw) {
  if (!raw) return "";
  const trimmed = raw.trim().replace(/[).,;'"]+$/, "");
  try {
    const url = new URL(trimmed);
    const host = url.hostname.replace(/^www\./, "");
    const path = url.pathname.replace(/\/+$/, "");
    return `${host}${path}`.toLowerCase();
  } catch {
    return trimmed.toLowerCase();
  }
}
