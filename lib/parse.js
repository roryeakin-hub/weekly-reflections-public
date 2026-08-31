/**
 * All message parsing: inbound MIME, inbound quote stripping, and reading a
 * previously-sent email back into its parts. Deliberately free of third-party
 * imports.
 *
 * These are the two functions most likely to be wrong, and both failed
 * silently in the original: a one-level-deep MIME walk returned "" for any
 * reply carrying an attachment, and an over-eager quote stripper ate answers
 * beginning with the word "On". Keeping them dependency-free means the test
 * suite runs on a bare clone with no `npm install` — which is the difference
 * between tests that get run and tests that do not.
 */

/** Recursively walk a MIME tree and return the first text/plain body. */
export function extractPlainText(part) {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) {
    return Buffer.from(part.body.data, "base64").toString("utf-8");
  }
  for (const child of part.parts || []) {
    const found = extractPlainText(child);
    if (found) return found;
  }
  return "";
}

/**
 * Strip quoted history from a reply. Handles the standard Gmail forms:
 * ">" prefixed lines, the "On <date>, <person> wrote:" attribution (which may
 * wrap across two lines), and a trailing signature delimiter.
 *
 * The second pattern is anchored on the full attribution shape on purpose. A
 * naive startsWith("On ") filter discards real answers — "On reflection, I
 * think..." — and does so invisibly, because the lost text simply never
 * appears in the next week's prompt.
 */
export function stripQuoted(text) {
  const kept = [];
  for (const line of text.split("\n")) {
    if (line.trimStart().startsWith(">")) break;
    if (/^\s*On\s.+\swrote:\s*$/.test(line)) break;
    if (/^\s*On\s(Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s/.test(line)) break;
    if (/^\s*--\s*$/.test(line)) break;
    kept.push(line);
  }
  return kept.join("\n").trim();
}

const DIVIDER = /─{5,}/;

/** Parse a sent email body back into its components. */
export function parseSentEmail(body) {
  const quoteMatch = body.match(/\*"([\s\S]*?)"\*\s*—\s*(.+)/);
  const quote = quoteMatch?.[1]?.trim() || "";
  const quoteAttribution = quoteMatch?.[2]?.trim() || "";

  const sections = body.split(DIVIDER);
  const questionBlock = sections[1] || "";
  const questions = [...questionBlock.matchAll(/^\s*\d+\.\s+(.+?)$/gm)].map((m) =>
    m[1].trim()
  );

  const urlMatch = body.match(/https?:\/\/\S+/);
  const resourceUrl = urlMatch?.[0] || "";

  return { quote, quoteAttribution, questions, resourceUrl };
}
