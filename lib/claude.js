import Anthropic from "@anthropic-ai/sdk";
import { anglesForWeek } from "./angles.js";
import { renderConversations } from "./state.js";
import { extractUrl, normalizeUrl } from "./urls.js";
import {
  MODEL,
  PROJECT_CONTEXT,
  INCLUDE_PROGRESS_ANCHOR,
  PROGRESS_ANCHOR_QUESTION,
  SUBJECT_PREFIX,
} from "./config.js";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// How far back the weekly article search may reach. A 7-day window against a
// weekly cadence meant consecutive runs searched overlapping pools, so the
// strongest match one week was still the strongest match the next — which is
// how one article went out twice. 30 days gives the search enough candidates
// that avoiding a repeat costs nothing in quality.
const RESOURCE_WINDOW_DAYS = Number(process.env.RESOURCE_WINDOW_DAYS || 30);

// Attempts before refusing to send. Covers both a repeated article and a
// generation that comes back unusable. Sending nothing is worse than one extra
// call; an unbounded loop against a paid API is worse than either.
const MAX_RESOURCE_ATTEMPTS = 3;

// How many times a paused turn may be continued. Server-side web search
// normally pauses at most once or twice.
const MAX_PAUSED_TURNS = 6;

async function generateOnce(state, rejectedUrl) {
  const { weekIndex, usedQuoteAttributions, usedQuestions, usedResourceUrls, conversations } =
    state;

  const angles = anglesForWeek(weekIndex);

  // The anchor question is appended by this code every week, so it appears in
  // every sent email and therefore in usedQuestions, which is parsed back out
  // of the archive. Left alone it would land in the DO NOT REPEAT list below —
  // instructing the model to avoid the one question the system deliberately
  // asks every single time. The model does not generate it, so nothing would
  // visibly break; it would just quietly steer away from that territory and
  // burn a slot in the truncated list. Filter it out.
  const priorQuestions = usedQuestions.filter(
    (q) => q.trim() !== PROGRESS_ANCHOR_QUESTION.trim()
  );

  const systemPrompt = `You are generating the ${SUBJECT_PREFIX} email.

${PROJECT_CONTEXT}

TONE
Warm but not saccharine. Intellectually serious. Treats the recipients as thoughtful adults who have read widely. Feels like it came from a sharp friend, not a productivity app or a coach. Never corporate, never self-help-y, never LinkedIn. No exclamation marks. No "I hope this finds you well" energy.

WHAT THEY HAVE SAID BACK
These are their actual replies from recent weeks — raw, not summarised. Use them. Reference what they are genuinely wrestling with. If anyone gave explicit instructions about the email itself (recipients sometimes address a note to "Claude"), treat those as binding requirements for this week, not suggestions.

${renderConversations(conversations)}

DO NOT REPEAT
- Quote sources already used: ${usedQuoteAttributions.slice(0, 20).join(" | ") || "none yet"}
- Questions already asked (do not restate these in new wording — the failure mode to avoid is asking the same question with fresh vocabulary):
${priorQuestions.slice(0, 24).map((q) => `  • ${q}`).join("\n") || "  none yet"}

This is week ${weekIndex + 1} of the series.`;

  // The exclusion list sits here, beside the search instruction, rather than in
  // the system preamble. A constraint stated next to the task it constrains is
  // followed far more reliably. It is still only a request — generateEmail()
  // enforces it in code, because a prompt cannot guarantee it.
  const alreadySent = usedResourceUrls.length
    ? `

Already sent in previous weeks. Do NOT return any of these, even if one is the strongest match — if your best candidate is on this list, take the next best:
${usedResourceUrls.slice(0, 30).map((u) => `  • ${u}`).join("\n")}`
    : "";

  const retryNote = rejectedUrl
    ? `

Your previous attempt returned ${rejectedUrl}, which has already been sent. Pick a genuinely different piece — not the same argument from another outlet.`
    : "";

  const userPrompt = `Search the web for a genuinely good piece published in the last ${RESOURCE_WINDOW_DAYS} days relevant to meaningful work, career design, purpose, priorities, institutions, or professional fulfilment. Prefer essays and research over listicles and news. It should be something a well-read person would not already have seen.${alreadySent}${retryNote}

Then write three questions — one for each of the assigned angles below. The recipients will pick whichever one has energy for them and answer that one; they are not expected to answer all three.

ASSIGNED ANGLES FOR THIS WEEK (one question each, in this order):

1. ${angles[0].label} — ${angles[0].brief}
2. ${angles[1].label} — ${angles[1].brief}
3. ${angles[2].label} — ${angles[2].brief}

Each question must:
- be answerable in a few honest paragraphs, not a yes/no
- be concrete and slightly uncomfortable — it should cost something to answer truthfully
- avoid the interrogative-hypothetical opener "If you..." (vary the grammar; this opener is a strong attractor and becomes monotonous fast)
- not be a question that could appear on LinkedIn or in a management book

Output ONLY this structure, no preamble, no commentary:

---QUOTE---
*"text"* — Attribution
(A single short quote. Non-obvious source: philosopher, novelist, scientist, historian, essayist. Never Steve Jobs, never "do what you love". It should earn its place, not decorate.)

---QUESTIONS---
1. [question for angle: ${angles[0].label}]

2. [question for angle: ${angles[1].label}]

3. [question for angle: ${angles[2].label}]

---RESOURCE---
[Title]
[Source / Author]
[2-3 sentences on why it is worth their time. Intellectually serious, ideally contrarian, human. Say what the piece argues, not that it is "thought-provoking".]
[URL]

---END---`;

  const request = {
    model: MODEL,
    // Server-side web_search returns its results as content blocks that count
    // against this budget. The email itself needs a few hundred tokens; the
    // headroom is for search results. Set this too low and search starves the
    // response, which surfaces as an empty generation.
    max_tokens: 8000,
    tools: [{ type: "web_search_20250305", name: "web_search" }],
    system: systemPrompt,
  };

  // A turn that uses a server tool can come back paused: the response carries
  // the search blocks but no text yet, and the turn continues only if the
  // partial assistant message is handed straight back. Reading text from a
  // single response parses a paused turn as "" — an intermittent failure that
  // stopped roughly half of all generations before this loop existed. Text is
  // accumulated across turns because it can be split between them.
  const messages = [{ role: "user", content: userPrompt }];
  const texts = [];
  let response;

  for (let turn = 0; turn < MAX_PAUSED_TURNS; turn++) {
    response = await client.messages.create({ ...request, messages });

    texts.push(...response.content.filter((b) => b.type === "text").map((b) => b.text));

    if (response.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: response.content });
  }

  const fullText = texts.join("\n").trim();

  if (!fullText) {
    console.warn(
      `Generation produced no text. stop_reason=${response?.stop_reason} blocks=${response?.content
        ?.map((b) => b.type)
        .join(",")}`
    );
  }

  const quote = section(fullText, "QUOTE", "QUESTIONS");
  const questions = section(fullText, "QUESTIONS", "RESOURCE");
  const resource = section(fullText, "RESOURCE", "END");

  // Fail loudly rather than sending a malformed email. Falling back to empty
  // strings produces a blank email that still reports success.
  if (!quote || !questions || !resource) {
    throw new Error(
      `Generation returned an unparseable response (quote:${!!quote} questions:${!!questions} resource:${!!resource}). Raw length ${fullText.length}.`
    );
  }

  const parsedQuestions = [...questions.matchAll(/^\s*\d+\.\s+(.+?)$/gm)].map((m) =>
    m[1].trim()
  );
  if (parsedQuestions.length !== 3) {
    throw new Error(`Expected 3 questions, parsed ${parsedQuestions.length}.`);
  }

  // The anchor question, on by default. See lib/config.js for the reasoning:
  // three rotating provocations give variety but no comparability, and the
  // constant question is the part you can actually measure six months later.
  let questionBlock = questions;
  if (INCLUDE_PROGRESS_ANCHOR) {
    questionBlock = `${questions}\n\n4. ${PROGRESS_ANCHOR_QUESTION}`;
    parsedQuestions.push(PROGRESS_ANCHOR_QUESTION);
  }

  return {
    body: formatEmailBody(quote, questionBlock, resource),
    quote,
    questions: parsedQuestions,
    resource,
    angles: angles.map((a) => a.id),
  };
}

/**
 * Generate the weekly email, refusing to reuse an article already sent.
 *
 * The repetition guard used to be a line in the prompt and nothing more, so a
 * duplicate URL passed straight through to the recipients. Structure was
 * validated in code; freshness was merely requested. This closes that gap the
 * same way every other check works — verify after generating, and throw rather
 * than send something wrong.
 */
export async function generateEmail(state) {
  const seen = new Set(state.usedResourceUrls.map(normalizeUrl).filter(Boolean));

  let rejectedUrl = null;
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RESOURCE_ATTEMPTS; attempt++) {
    let generated;

    // A generation can come back unusable — unparseable, or the wrong number of
    // questions. Those throw inside generateOnce(). Retrying is worth one extra
    // call, because the alternative is no email at all. Billing and auth errors
    // are not retried: they will not recover within this request, and burning
    // attempts on them hides the real cause.
    try {
      generated = await generateOnce(state, rejectedUrl);
    } catch (err) {
      if (err.status === 400 || err.status === 401 || err.status === 403) throw err;
      lastError = err;
      console.warn(`Attempt ${attempt}/${MAX_RESOURCE_ATTEMPTS} failed: ${err.message}`);
      continue;
    }

    const url = extractUrl(generated.resource);

    if (url && seen.has(normalizeUrl(url))) {
      rejectedUrl = url;
      lastError = null;
      console.warn(
        `Attempt ${attempt}/${MAX_RESOURCE_ATTEMPTS} returned an already-sent article (${url}) — regenerating.`
      );
      continue;
    }

    return generated;
  }

  if (lastError) {
    throw new Error(
      `Generation failed on all ${MAX_RESOURCE_ATTEMPTS} attempts. Last error: ${lastError.message}`
    );
  }

  throw new Error(
    `Article selection returned an already-sent URL (${rejectedUrl}) on all ${MAX_RESOURCE_ATTEMPTS} attempts — refusing to send a duplicate.`
  );
}

function section(text, open, close) {
  const re = new RegExp(`---${open}---\\s*\\n([\\s\\S]*?)---${close}---`);
  return text.match(re)?.[1]?.trim() || "";
}

function formatEmailBody(quote, questions, resource) {
  return `${quote}


─────────────────────────────

Pick whichever one has energy for you — you don't need to answer all three.

${questions}


─────────────────────────────

Something worth your attention this week:

${resource}


─────────────────────────────
Reply to this email with your reflections. Your replies are read before next week's questions are written — including notes addressed to Claude about the email itself.`;
}
