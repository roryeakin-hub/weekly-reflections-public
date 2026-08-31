import { sendEmail } from "../lib/gmail.js";
import { generateEmail } from "../lib/claude.js";
import { deriveState } from "../lib/state.js";
import { authorize } from "../lib/auth.js";
import { SENDING_ENABLED, recipients, subjectForDate } from "../lib/config.js";

export const config = { maxDuration: 120 };

/**
 * Generate and send the weekly email.
 *
 * Two gates stand in front of the send, and BOTH are checked before any model
 * call, not after. A fresh deployment is inert: it will refuse here, cheaply
 * and loudly, rather than generating something and then discovering it has
 * nowhere to send it.
 *
 *   1. SENDING_ENABLED must be exactly "true"
 *   2. RECIPIENTS must be non-empty
 *
 * Neither has a default that sends. Use /api/preview to see output without
 * either gate open.
 */
export default async function handler(req, res) {
  if (!authorize(req)) return res.status(401).json({ error: "Unauthorized" });

  const to = recipients();

  if (!SENDING_ENABLED) {
    console.log("Sending is disabled — set SENDING_ENABLED=true to enable.");
    return res.status(200).json({
      sent: false,
      reason: "SENDING_ENABLED is not set to \"true\".",
      hint: "This is the default. See README → Turning sending on.",
    });
  }

  if (!to.length) {
    console.log("No recipients configured — refusing to send.");
    return res.status(200).json({
      sent: false,
      reason: "RECIPIENTS is empty.",
      hint: "Set RECIPIENTS to a comma-separated list of addresses.",
    });
  }

  try {
    // State is derived from the mail archive, so there is nothing to persist
    // after the send — and therefore no post-send write that can fail silently.
    // The original design sent first and wrote state second; when the write
    // threw, the email still went out and the 500 was never seen by anyone.
    const state = await deriveState();
    console.log(
      `Week ${state.weekIndex + 1}. ${state.usedQuestions.length} prior questions, ` +
        `${state.totalReplies} replies across ${state.conversations.length} threads.`
    );

    const generated = await generateEmail(state);

    const { threadId, messageId } = await sendEmail({
      to,
      subject: subjectForDate(),
      body: generated.body,
    });

    console.log(`Sent. thread=${threadId} angles=${generated.angles.join(",")}`);

    return res.status(200).json({
      sent: true,
      week: state.weekIndex + 1,
      recipientCount: to.length,
      threadId,
      messageId,
      angles: generated.angles,
      questions: generated.questions,
      repliesConsidered: state.totalReplies,
    });
  } catch (err) {
    console.error("Send error:", err);
    return res.status(500).json({ error: err.message });
  }
}
