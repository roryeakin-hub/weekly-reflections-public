import { listPriorSends, getRepliesForThread } from "./gmail.js";
import { formatDate } from "./config.js";
import { parseSentEmail } from "./parse.js";

// Re-exported: callers think of it as part of the state module.
export { parseSentEmail };

/**
 * Week-to-week state, derived from the mail archive on every run.
 *
 * WHY THERE IS NO DATABASE
 * ------------------------
 * The first version of this system kept state in a key-value store, written
 * through a provider REST API with an account-scoped token. Two structural
 * problems, one of which was fatal:
 *
 *   1. The write path depended on a token scope that could stop working
 *      without any signal. It did. The store held zero items for ten weeks
 *      while emails kept going out — because the send happened before the
 *      write, so a failed write produced a 500 on a cron invocation nobody
 *      reads, in logs that were discarded within days.
 *
 *   2. There was a second copy of the truth. The mail thread already contains
 *      every question asked, every quote used and every reply given, in a
 *      durable, human-readable, independently backed-up form. A derived cache
 *      that can disagree with the source of truth is a liability, not an
 *      optimisation.
 *
 * Deriving state costs a handful of API calls per week and removes an entire
 * class of failure. A failed run costs nothing: the next run still sees the
 * full history. The system is self-healing rather than requiring repair.
 *
 * The cost of this choice, stated honestly: it is O(n) API calls in the
 * history window, and it makes the mail provider load-bearing. If you delete
 * the thread, you delete the memory. That trade is worth it at this scale and
 * would not be at a much larger one.
 */

/**
 * @param {{historyWeeks?: number, replyWeeks?: number}} opts
 */
export async function deriveState({ historyWeeks = 12, replyWeeks = 6 } = {}) {
  const sends = await listPriorSends({ limit: historyWeeks });

  const history = sends.map((s) => ({
    sentAt: s.sentAt,
    subject: s.subject,
    threadId: s.threadId,
    messageId: s.messageId,
    ...parseSentEmail(s.body),
  }));

  // Only fetch replies for the recent window — older threads inform the
  // do-not-repeat lists but not the tone of this week's questions.
  const recent = sends.slice(0, replyWeeks);
  const conversations = [];
  for (const s of recent) {
    const replies = await getRepliesForThread(s.threadId, s.messageId);
    if (replies.length) {
      conversations.push({
        sentAt: s.sentAt,
        subject: s.subject,
        questions: parseSentEmail(s.body).questions,
        replies,
      });
    }
  }

  return {
    weekIndex: history.length, // zero-indexed: next email is week `weekIndex`
    lastSentAt: history[0]?.sentAt || null,
    lastThreadId: history[0]?.threadId || null,
    usedQuoteAttributions: history.map((h) => h.quoteAttribution).filter(Boolean),
    usedQuestions: history.flatMap((h) => h.questions).filter(Boolean),
    usedResourceUrls: history.map((h) => h.resourceUrl).filter(Boolean),
    conversations, // newest first
    totalReplies: conversations.reduce((n, c) => n + c.replies.length, 0),
  };
}

/**
 * Render the reply history for inclusion in a prompt.
 *
 * Built fresh from the raw replies every week rather than being an
 * iteratively-rewritten summary. The earlier design asked the model to
 * "replace the existing summary, don't append", which meant an explicit
 * instruction — "vary question 1 more" — would be compressed away within two
 * or three cycles. Recomputing from source makes that decay impossible.
 */
export function renderConversations(conversations, { maxWeeks = 6 } = {}) {
  if (!conversations.length) return "No replies yet.";
  return conversations
    .slice(0, maxWeeks)
    .map((c) => {
      const when = formatDate(c.sentAt, { month: "short" });
      const asked = c.questions.map((q, i) => `  Q${i + 1}: ${q}`).join("\n");
      const said = c.replies
        .map((r) => `  ${r.from.replace(/<.*>/, "").trim() || r.from}:\n${indent(r.body)}`)
        .join("\n\n");
      return `── Week of ${when} ──\nAsked:\n${asked}\n\nReplied:\n${said}`;
    })
    .join("\n\n");
}

function indent(text) {
  return text
    .split("\n")
    .map((l) => "    " + l)
    .join("\n");
}
