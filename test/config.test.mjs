// Guards the one silent-failure mode that survived the rewrite of everything
// else: the subject prefix is BOTH the outgoing subject and the Gmail search
// key that recovers all prior state. If the two ever drift, the system finds
// zero prior sends, believes it is week 1, restarts the angle rotation and
// empties every repetition guard — with no error anywhere.
//
// Run: node test/config.test.mjs
import assert from "node:assert/strict";

let pass = 0;
const t = (name, fn) => {
  try {
    fn();
    pass++;
    console.log(`  ok  ${name}`);
  } catch (e) {
    console.error(`FAIL  ${name}\n      ${e.message}`);
    process.exitCode = 1;
  }
};

const {
  SUBJECT_PREFIX,
  SENDING_ENABLED,
  INCLUDE_PROGRESS_ANCHOR,
  PROGRESS_ANCHOR_QUESTION,
  recipients,
  subjectForDate,
  priorSendsQuery,
  isSeriesSubject,
  calendarDay,
  formatDate,
} = await import("../lib/config.js");

const DATE = new Date("2026-08-31T14:00:00Z");

t("a generated subject is recognised as belonging to the series", () => {
  assert.ok(isSeriesSubject(subjectForDate(DATE)));
});

t("the search query contains the same prefix the subject is built from", () => {
  assert.ok(priorSendsQuery().includes(SUBJECT_PREFIX));
  assert.ok(subjectForDate(DATE).startsWith(SUBJECT_PREFIX));
});

t("a reply subject is not mistaken for an original send", () => {
  // Gmail's own query excludes "Re:", but isSeriesSubject is the backstop.
  assert.ok(!isSeriesSubject(`Re: ${subjectForDate(DATE)}`));
});

t("an unrelated subject is rejected", () => {
  assert.ok(!isSeriesSubject("Lunch tomorrow?"));
});

t("sending is OFF unless explicitly enabled", () => {
  // No SENDING_ENABLED in the test environment, which is the default state of
  // a fresh clone. This test failing means a clone could mail someone.
  assert.equal(SENDING_ENABLED, false);
});

t("there are no recipients unless explicitly configured", () => {
  assert.deepEqual(recipients(), []);
});

t("recipient parsing trims whitespace and drops empties", () => {
  const prev = process.env.RECIPIENTS;
  process.env.RECIPIENTS = " a@example.com , ,b@example.com,";
  assert.deepEqual(recipients(), ["a@example.com", "b@example.com"]);
  if (prev === undefined) delete process.env.RECIPIENTS;
  else process.env.RECIPIENTS = prev;
});

t("the progress anchor is ON by default", () => {
  // Reversed deliberately: see DESIGN-NOTES.md. Three rotating questions give
  // variety but nothing comparable across weeks.
  assert.equal(INCLUDE_PROGRESS_ANCHOR, true);
});

t("the anchor is disabled only by the exact string 'false'", async () => {
  const prev = process.env.INCLUDE_PROGRESS_ANCHOR;
  for (const [value, expected] of [["false", false], ["true", true], ["", true], ["no", true]]) {
    process.env.INCLUDE_PROGRESS_ANCHOR = value;
    // Fresh module instance: the flag is read once at import time.
    const m = await import(`../lib/config.js?anchor=${encodeURIComponent(value)}`);
    assert.equal(m.INCLUDE_PROGRESS_ANCHOR, expected, `value ${JSON.stringify(value)}`);
  }
  if (prev === undefined) delete process.env.INCLUDE_PROGRESS_ANCHOR;
  else process.env.INCLUDE_PROGRESS_ANCHOR = prev;
});

t("the anchor question has stable wording to filter against", () => {
  // lib/claude.js excludes this exact string from the do-not-repeat list. If
  // the two ever diverge, the system starts telling the model not to ask the
  // one question it asks every week.
  assert.ok(PROGRESS_ANCHOR_QUESTION.length > 10);
  assert.equal(PROGRESS_ANCHOR_QUESTION, PROGRESS_ANCHOR_QUESTION.trim());
});

t("dates format in the configured timezone", () => {
  assert.equal(formatDate(DATE), "August 31, 2026");
  assert.equal(calendarDay(DATE), "2026-08-31");
});

console.log(`\n${pass} passed`);
