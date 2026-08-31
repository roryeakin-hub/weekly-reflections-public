import { deriveState } from "../lib/state.js";
import { anglesForWeek, upcomingSchedule, ANGLES } from "../lib/angles.js";
import { authorize } from "../lib/auth.js";
import {
  SENDING_ENABLED,
  INCLUDE_PROGRESS_ANCHOR,
  SUBJECT_PREFIX,
  TIMEZONE,
  recipients,
} from "../lib/config.js";

export const config = { maxDuration: 60 };

/**
 * What the system currently believes, and what it will do next.
 *
 * Everything here is derived from the mail archive at request time, so this
 * endpoint cannot show a stale picture the way a status page reading from a
 * cache could. If this says the feedback loop is active, it is active — that
 * claim is the one the original system got wrong for ten weeks while
 * advertising the opposite in every email.
 *
 * Recipient addresses are reported as a count, never as values.
 */
export default async function handler(req, res) {
  if (!authorize(req)) return res.status(401).json({ error: "Unauthorized" });

  try {
    const state = await deriveState();

    return res.status(200).json({
      config: {
        subjectPrefix: SUBJECT_PREFIX,
        timezone: TIMEZONE,
        sendingEnabled: SENDING_ENABLED,
        recipientCount: recipients().length,
        willSend: SENDING_ENABLED && recipients().length > 0,
        progressAnchorEnabled: INCLUDE_PROGRESS_ANCHOR,
      },
      health: {
        feedbackLoopActive: state.totalReplies > 0,
        repliesFound: state.totalReplies,
        threadsWithReplies: state.conversations.length,
        priorSends: state.weekIndex,
        lastSentAt: state.lastSentAt,
      },
      nextEmail: {
        week: state.weekIndex + 1,
        angles: anglesForWeek(state.weekIndex).map((a) => ({ id: a.id, label: a.label })),
      },
      rotation: {
        taxonomySize: ANGLES.length,
        upcoming: upcomingSchedule(state.weekIndex, 5),
      },
      repetitionGuard: {
        questionsOnRecord: state.usedQuestions.length,
        quoteSourcesOnRecord: state.usedQuoteAttributions.length,
        articlesOnRecord: state.usedResourceUrls.length,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
