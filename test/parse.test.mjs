// Round-trip and reply-parsing tests.
//
// Every fixture here is synthetic. The originals were real archived messages,
// which made the tests excellent and the repository unpublishable — a test
// fixture is a verbatim copy of someone's private mail. These reproduce the
// exact structural properties that matter (the divider format, a wrapped
// attribution line, a line that legitimately begins with "on") without
// containing anyone's words.
//
// Run: node test/parse.test.mjs
import assert from "node:assert/strict";
import { parseSentEmail, stripQuoted } from "../lib/parse.js";

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

// ── A representative sent email ─────────────────────────────────────────────
const SENT = `*"The whole of science is nothing more than a refinement of everyday thinking."* — Albert Einstein


─────────────────────────────

Pick whichever one has energy for you — you don't need to answer all three.

1. Name the commitment you would drop first if someone else made the decision for you, and say what has kept you from making it yourself.

2. Which piece of your current work would still be standing in a year if you stopped touching it tomorrow?

3. Describe the last time a colleague changed your mind about something that mattered.


─────────────────────────────

Something worth your attention this week:

The Quiet Arithmetic of Saying Yes
Example Review / A. Writer

Argues that commitment costs are systematically underestimated because the
foreclosed alternatives are never enumerated.

https://example.com/2026/08/quiet-arithmetic-of-saying-yes


─────────────────────────────
Reply to this email with your reflections.`;

t("parses the quote attribution", () => {
  assert.equal(parseSentEmail(SENT).quoteAttribution, "Albert Einstein");
});

t("parses the quote text without the markdown emphasis", () => {
  assert.match(parseSentEmail(SENT).quote, /^The whole of science/);
});

t("parses every question and nothing else", () => {
  const { questions } = parseSentEmail(SENT);
  assert.equal(questions.length, 3);
  assert.match(questions[0], /^Name the commitment/);
  assert.match(questions[2], /changed your mind/);
});

t("parses the resource URL, not the divider or the quote", () => {
  assert.equal(
    parseSentEmail(SENT).resourceUrl,
    "https://example.com/2026/08/quiet-arithmetic-of-saying-yes"
  );
});

t("does not mistake the resource block for a question", () => {
  assert.ok(!parseSentEmail(SENT).questions.some((q) => /Example Review/.test(q)));
});

// ── A representative reply ──────────────────────────────────────────────────
// Contains: an out-of-band note to the generator, in-band answers, one answer
// line beginning with a lowercase "on", and a wrapped Gmail attribution.
const REPLY = `Feedback for Claude - question 1 is too close to last week's. Please widen
the lens.

on 1) mostly yes. This chapter has more flexibility than the last one.

2) the new collaborator has been useful less for the building and more for
arguing with me about what to build.

On Mon, Aug 10, 2026 at 7:01 AM Weekly Reflection <sender@example.com>
wrote:

> *"The whole of science is nothing more than a refinement of everyday
> thinking."* — Albert Einstein
>
> 1. Name the commitment you would drop first...`;

t("keeps an out-of-band note addressed to the generator", () => {
  const out = stripQuoted(REPLY);
  assert.match(out, /Feedback for Claude/);
  assert.match(out, /widen\nthe lens/);
});

t("keeps an answer line that begins with a lowercase 'on'", () => {
  // The original filter dropped every line starting with "On ", and only the
  // accident of lowercase saved this one. The rewrite anchors on the full
  // attribution pattern instead.
  const out = stripQuoted(REPLY);
  assert.match(out, /on 1\) mostly yes/);
  assert.match(out, /new collaborator/);
});

t("drops the quoted original entirely", () => {
  const out = stripQuoted(REPLY);
  assert.doesNotMatch(out, /Albert Einstein/);
  assert.equal(out.includes(">"), false);
});

t("does not eat a sentence that merely starts with 'On'", () => {
  const body = "On reflection, the winding-down question landed hardest.\n\nThat is my answer.";
  assert.match(stripQuoted(body), /On reflection/);
});

t("stops at an attribution line even with no '>' block after it", () => {
  const body = "My answer here.\n\nOn Tue, Aug 11, 2026 at 12:47 PM A Person <a@example.com> wrote:\nquoted stuff";
  assert.equal(stripQuoted(body), "My answer here.");
});

t("stops at a signature delimiter", () => {
  assert.equal(stripQuoted("The answer.\n\n--\nSent from a phone"), "The answer.");
});

t("returns empty string for a reply that is only quoted text", () => {
  assert.equal(stripQuoted("> everything was quoted"), "");
});

// ── Angle rotation ──────────────────────────────────────────────────────────
const { anglesForWeek, ANGLES } = await import("../lib/angles.js");

t("assigns exactly 3 distinct angles per week", () => {
  for (let w = 0; w < 60; w++) {
    const ids = anglesForWeek(w).map((a) => a.id);
    assert.equal(new Set(ids).size, 3, `week ${w} repeated an angle within itself`);
  }
});

t("never repeats an angle within 5 consecutive weeks", () => {
  for (let w = 0; w < 60; w++) {
    const window = [];
    for (let i = 0; i < 5; i++) window.push(...anglesForWeek(w + i).map((a) => a.id));
    assert.equal(new Set(window).size, window.length, `angle repeated in weeks ${w}-${w + 4}`);
  }
});

t("covers the whole taxonomy within one full cycle", () => {
  const seen = new Set();
  for (let w = 0; w < ANGLES.length; w++) anglesForWeek(w).forEach((a) => seen.add(a.id));
  assert.equal(seen.size, ANGLES.length);
});

t("is deterministic", () => {
  assert.deepEqual(anglesForWeek(7).map((a) => a.id), anglesForWeek(7).map((a) => a.id));
});

console.log(`\n${pass} passed`);
