import { google } from "googleapis";
import { extractPlainText, stripQuoted } from "./parse.js";
import {
  MESSAGE_HEADER,
  calendarDay,
  isSeriesSubject,
  priorSendsQuery,
} from "./config.js";

// Re-exported so callers (and tests) have one obvious import site.
export { extractPlainText, stripQuoted };

function getOAuthClient() {
  const client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    "urn:ietf:wg:oauth:2.0:oob"
  );
  client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  return client;
}

function gmailClient() {
  return google.gmail({ version: "v1", auth: getOAuthClient() });
}

function header(msg, name) {
  const h = msg?.payload?.headers || [];
  return h.find((x) => x.name?.toLowerCase() === name.toLowerCase())?.value || "";
}

export async function sendEmail({ to, subject, body, threadId }) {
  const gmail = gmailClient();
  const toList = Array.isArray(to) ? to.join(", ") : to;

  const messageParts = [
    `From: ${process.env.SENDER_NAME || "Weekly Reflection"} <${process.env.SENDER_EMAIL}>`,
    `To: ${toList}`,
    `Subject: ${subject}`,
    `Reply-To: ${process.env.SENDER_EMAIL}`,
    `${MESSAGE_HEADER}: true`,
    `Content-Type: text/plain; charset=utf-8`,
    ``,
    body,
  ];

  const raw = Buffer.from(messageParts.join("\n"))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: threadId ? { raw, threadId } : { raw },
  });

  return { threadId: res.data.threadId, messageId: res.data.id };
}

/**
 * All prior sends in this series, newest first.
 *
 * Deduplicated to one per calendar day. A debugging session that fires five
 * sends in twenty minutes would otherwise count as five weeks and corrupt the
 * angle rotation index.
 */
export async function listPriorSends({ limit = 12 } = {}) {
  const gmail = gmailClient();

  const list = await gmail.users.messages.list({
    userId: "me",
    q: priorSendsQuery(),
    maxResults: 50,
  });

  const ids = (list.data.messages || []).map((m) => m.id);
  const sends = [];

  for (const id of ids) {
    const msg = await gmail.users.messages.get({ userId: "me", id, format: "full" });
    const subject = header(msg.data, "Subject");
    // Gmail's subject matching is fuzzy enough to pull in replies. Filter exactly.
    if (!isSeriesSubject(subject)) continue;

    sends.push({
      messageId: msg.data.id,
      threadId: msg.data.threadId,
      subject,
      sentAt: new Date(Number(msg.data.internalDate)),
      body: extractPlainText(msg.data.payload),
    });
  }

  sends.sort((a, b) => b.sentAt - a.sentAt);

  const seenDays = new Set();
  const deduped = [];
  for (const s of sends) {
    const day = calendarDay(s.sentAt);
    if (seenDays.has(day)) continue;
    seenDays.add(day);
    deduped.push(s);
  }

  return deduped.slice(0, limit);
}

/**
 * Replies to a thread, excluding the original send and anything this system
 * sent itself. Returns [] rather than throwing on a missing thread, so a
 * deleted thread degrades gracefully instead of taking down the week.
 */
export async function getRepliesForThread(threadId, originalMessageId) {
  const gmail = gmailClient();

  let thread;
  try {
    thread = await gmail.users.threads.get({ userId: "me", id: threadId, format: "full" });
  } catch (err) {
    if (err?.code === 404) return [];
    throw err;
  }

  const messages = thread.data.messages || [];

  return messages
    .filter((m) => m.id !== originalMessageId)
    .filter((m) => header(m, MESSAGE_HEADER) !== "true")
    .map((m) => ({
      from: header(m, "From"),
      date: new Date(Number(m.internalDate)),
      body: stripQuoted(extractPlainText(m.payload)),
    }))
    .filter((r) => r.body.length > 10);
}
