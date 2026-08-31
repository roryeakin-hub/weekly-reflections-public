import { generateEmail } from "../lib/claude.js";
import { deriveState } from "../lib/state.js";
import { authorize } from "../lib/auth.js";
import { subjectForDate } from "../lib/config.js";

export const config = { maxDuration: 120 };

/**
 * Generate an email and return it WITHOUT sending. Ignores SENDING_ENABLED and
 * RECIPIENTS entirely — no address is read, so nothing can leave.
 *
 * The single biggest obstacle to iterating on the original system was that the
 * only way to see output was to wait until Monday. This endpoint makes the loop
 * seconds long instead of a week, and it is the intended way to evaluate the
 * thing before you let it mail anybody.
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        "https://<your-deployment>/api/preview?format=text"
 */
export default async function handler(req, res) {
  if (!authorize(req)) return res.status(401).json({ error: "Unauthorized" });

  try {
    const state = await deriveState();
    const generated = await generateEmail(state);

    if (req.query?.format === "text") {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      return res.status(200).send(`Subject: ${subjectForDate()}\n\n${generated.body}`);
    }

    return res.status(200).json({
      week: state.weekIndex + 1,
      subject: subjectForDate(),
      angles: generated.angles,
      questions: generated.questions,
      body: generated.body,
      context: {
        priorQuestionCount: state.usedQuestions.length,
        repliesConsidered: state.totalReplies,
        threadsWithReplies: state.conversations.length,
        lastSentAt: state.lastSentAt,
      },
    });
  } catch (err) {
    console.error("Preview error:", err);
    return res.status(500).json({ error: err.message });
  }
}
