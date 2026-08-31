import assert from "node:assert/strict";
import { extractUrl, normalizeUrl } from "../lib/urls.js";

let failed = 0;
let passed = 0;
function t(name, fn) {
  try {
    fn();
    passed++;
    console.log("  ok ", name);
  } catch (e) {
    failed++;
    console.log("  FAIL", name, "\n      ", e.message);
  }
}

// A realistic article URL. The duplicate-article failure this guards against
// is not hypothetical: the same piece was sent two weeks running because the
// search window overlapped and the exclusion list lived only in the prompt.
const ARTICLE =
  "https://www.example.com/essays/2026/08/the-quiet-arithmetic-of-saying-yes/";

t("treats an identical URL as already sent", () => {
  assert.equal(normalizeUrl(ARTICLE), normalizeUrl(ARTICLE));
});

t("ignores a trailing slash", () => {
  assert.equal(normalizeUrl(ARTICLE), normalizeUrl(ARTICLE.replace(/\/$/, "")));
});

t("ignores tracking parameters", () => {
  assert.equal(normalizeUrl(ARTICLE), normalizeUrl(`${ARTICLE}?utm_source=newsletter`));
});

t("ignores a fragment", () => {
  assert.equal(normalizeUrl(ARTICLE), normalizeUrl(`${ARTICLE}#section-2`));
});

t("ignores a www. prefix", () => {
  assert.equal(normalizeUrl(ARTICLE), normalizeUrl(ARTICLE.replace("www.", "")));
});

t("ignores scheme differences", () => {
  assert.equal(normalizeUrl(ARTICLE), normalizeUrl(ARTICLE.replace("https://", "http://")));
});

t("strips punctuation the model appends to a bare URL", () => {
  assert.equal(normalizeUrl(ARTICLE), normalizeUrl(`${ARTICLE},`));
});

t("keeps genuinely different articles distinct", () => {
  const other =
    "https://www.example.com/essays/2026/07/a-completely-different-piece/";
  assert.notEqual(normalizeUrl(ARTICLE), normalizeUrl(other));
});

t("distinguishes different hosts sharing a path", () => {
  assert.notEqual(
    normalizeUrl("https://example.com/2026/08/08/piece"),
    normalizeUrl("https://other.com/2026/08/08/piece")
  );
});

t("returns empty for an absent URL", () => {
  assert.equal(normalizeUrl(""), "");
  assert.equal(normalizeUrl(null), "");
});

t("does not throw on a malformed URL", () => {
  assert.equal(normalizeUrl("not a url"), "not a url");
});

t("pulls the URL out of a resource block", () => {
  const resource = `The Quiet Arithmetic of Saying Yes
Example Review / A. Writer
Argues that commitment costs are underestimated because the
foreclosed alternatives are never enumerated.
${ARTICLE}`;
  assert.equal(extractUrl(resource), ARTICLE);
});

t("returns empty when a resource block has no URL", () => {
  assert.equal(extractUrl("A title\nAn author\nNo link at all."), "");
});

console.log(failed ? `\n${failed} failed` : `\n${passed} passed`);
process.exit(failed ? 1 : 0);
