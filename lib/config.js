/**
 * Every deployment-specific value, in one place.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * In the private original, three things were hardcoded across several files:
 * the email subject prefix, the timezone, and the recipient context. The
 * subject prefix was the dangerous one. It is not cosmetic — it is the
 * primary key of the entire state mechanism. `listPriorSends()` finds past
 * emails by searching Gmail for that prefix, and `send-email.js` built the
 * outgoing subject from a separate string literal. Change one and not the
 * other and nothing breaks loudly: the search returns zero prior sends, the
 * system believes it is week 1, the angle rotation restarts, and every
 * repetition guard silently empties. You would not notice for a month.
 *
 * Defining it once, here, makes that class of drift impossible.
 */

/** Subject prefix. ALSO the Gmail search key — see the warning above. */
export const SUBJECT_PREFIX = process.env.SUBJECT_PREFIX || "Weekly Reflection";

/**
 * A stable header stamped on outgoing mail so the reply reader can tell its
 * own sends apart from genuine replies. Deliberately NOT derived from
 * SUBJECT_PREFIX: renaming the series must not orphan the history.
 */
export const MESSAGE_HEADER = "X-Reflection-Engine";

/** IANA timezone for date formatting and same-day deduplication. */
export const TIMEZONE = process.env.TIMEZONE || "UTC";

export const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-5";

/**
 * Master send switch. Must be the exact string "true".
 *
 * The default is off, and the default is off on purpose. A fresh clone with
 * credentials filled in should not be able to mail anyone by accident — not
 * on a cron misfire, not on a stray curl, not because someone was exploring
 * the deployment. Turning this on is a deliberate, separate act from
 * configuring the system. `/api/preview` works fully without it, so you can
 * evaluate the output for as many weeks as you like before any mail moves.
 */
export const SENDING_ENABLED = process.env.SENDING_ENABLED === "true";

/** Comma-separated recipient list. Empty by default. */
export function recipients() {
  return (process.env.RECIPIENTS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Why the recipients are doing this, in their own terms.
 *
 * This is the single highest-leverage input to output quality, and it is
 * deliberately not in the repository: written well it describes real people
 * in specific terms, and specific descriptions of real people do not belong
 * in a public git history. Set PROJECT_CONTEXT in your environment.
 *
 * The fallback below is generic, and the questions it produces are
 * correspondingly generic. That is not a bug to fix in the fallback; it is
 * the reason to set the variable.
 */
export const PROJECT_CONTEXT =
  process.env.PROJECT_CONTEXT ||
  `The recipients are adults who want help noticing the gap between what they say they value and how they actually spend their attention. Neither needs advice; both need better questions than the ones they would ask themselves.

This is a standing ritual between peers, not a coaching product. The email is a prompt for honest thinking, and the replies are the point.`;

/**
 * A fixed question appended as a fourth item every week. ON by default.
 *
 * Three rotating questions buy variety at the cost of comparability. The
 * rotating angles are the more visible property — they are what makes the
 * email feel fresh — which is exactly why they won this argument in the first
 * version and exactly why the default is now the other way. A question asked
 * identically every week is the only thing you can look back over six months
 * and actually measure; without one there is no time series, just a pile of
 * interesting Mondays.
 *
 * Set INCLUDE_PROGRESS_ANCHOR=false to drop it.
 */
export const INCLUDE_PROGRESS_ANCHOR = process.env.INCLUDE_PROGRESS_ANCHOR !== "false";

/** The anchor's wording. Exported so the repetition guard can exclude it. */
export const PROGRESS_ANCHOR_QUESTION =
  process.env.PROGRESS_ANCHOR_QUESTION ||
  "And regardless: what changed this week to move you toward your goals?";

/** Format a date for display in the configured timezone. */
export function formatDate(date, opts = {}) {
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: TIMEZONE,
    ...opts,
  });
}

/** ISO calendar day in the configured timezone, for same-day deduplication. */
export function calendarDay(date) {
  return date.toLocaleDateString("en-CA", { timeZone: TIMEZONE });
}

/**
 * The subject line for a send. The ONLY place an outgoing subject is built,
 * so it cannot drift from the prefix the archive is searched by.
 */
export function subjectForDate(date = new Date()) {
  return `${SUBJECT_PREFIX} - ${formatDate(date)}`;
}

/** The Gmail query that finds prior sends. Shares SUBJECT_PREFIX by construction. */
export function priorSendsQuery() {
  return `in:sent subject:"${SUBJECT_PREFIX}" -subject:"Re:" -subject:"Fwd:"`;
}

/** True if a subject line belongs to this series. Guards Gmail's fuzzy matching. */
export function isSeriesSubject(subject) {
  return subject.trim().toLowerCase().startsWith(SUBJECT_PREFIX.toLowerCase());
}
