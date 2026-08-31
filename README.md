# Weekly Reflections

A weekly email that asks three deliberately uncomfortable questions, reads the
replies, and uses them to write the next week's questions.

It is not a newsletter and not a productivity app. It is a small accountability
ritual between a handful of people who already know each other, automated just
enough that nobody has to remember to run it.

**It sends no email until you explicitly turn sending on.** A fresh deployment
is inert by design — see [Turning sending on](#turning-sending-on).

---

## What it actually does

Every week, one email goes out containing:

1. **A quote** from a non-obvious source, not reused from a previous week.
2. **Three questions**, one from each of three angles assigned by a
   deterministic rotation over a 20-angle taxonomy. Recipients answer whichever
   one has energy for them; answering all three is not the point.
3. **One recent article** worth reading, verified in code not to be one already
   sent.

Recipients reply to the email. Those replies are read on the next run and go
into the prompt verbatim. A reply can also address the generator directly — a
line beginning "Feedback for Claude…" is treated as a binding instruction for
the following week, not a suggestion.

## The two design decisions worth knowing about

**There is no database.** State — which questions have been asked, which quotes
and articles are used up, what people said back — is derived from the mail
archive on every run. The thread already contains all of it, in a durable,
human-readable, independently backed-up form. A second copy that can disagree
with the first is a liability, not an optimisation. The practical payoff: a
failed run costs nothing, because the next run still sees the full history.

**Repetition is prevented structurally, not by asking nicely.** The obvious
approach — "do not reuse these questions" in the prompt — only blocks *lexical*
repetition. A model told not to reuse a sentence will cheerfully produce the
same question in new clothes. So the angle for each question is assigned by a
pure function of the week index, and the model is not given the choice. Article
freshness is likewise checked in code after generation, not requested in the
prompt.

Both decisions are reactions to specific failures. [DESIGN-NOTES.md](DESIGN-NOTES.md)
is the full account, including one failure that ran silently for ten weeks
while the system reported success.

## Requirements

- A Gmail account (used for both sending and reading — reading is the memory)
- An Anthropic API key
- Vercel, or any host that can run three serverless functions on a schedule

Running cost is dominated by one Claude call per week with web search enabled.
At current pricing that is cents per week, plus whatever your host charges.

## Quickstart

```bash
git clone https://github.com/<you>/weekly-reflections-public.git
cd weekly-reflections-public
npm install
npm test          # 40 tests, no credentials or network needed
```

The test suite runs on a bare clone — the parsing logic is deliberately
dependency-free — so you can verify the machinery before wiring up any
credentials.

Then follow [SETUP.md](SETUP.md) for Gmail OAuth and deployment. It takes about
twenty minutes, most of it waiting on Google's consent screen.

## Turning sending on

Sending is gated behind **two** independent switches, both off by default, and
both checked before any model call:

| Variable | Default | Must be |
| --- | --- | --- |
| `SENDING_ENABLED` | unset (off) | the exact string `true` |
| `RECIPIENTS` | empty | comma-separated addresses |

With either one unset, `POST /api/send-email` returns `200 {"sent": false}` with
the reason. It does not error, and it does not mail anyone.

There is also **no cron schedule in `vercel.json`**. Even with both switches on,
nothing fires until you add one. To go live:

1. Verify the output first. `GET /api/preview?format=text` generates a complete
   email and returns it in the response body. It never reads `RECIPIENTS` at
   all, so it cannot send. Run it as many weeks as you like.
2. Set `PROJECT_CONTEXT`. Skipping this is the single most common way to end up
   disappointed with the output — see below.
3. Set `RECIPIENTS`, then `SENDING_ENABLED=true`.
4. Add the schedule to `vercel.json` and redeploy:

   ```json
   {
     "$schema": "https://openapi.vercel.sh/vercel.json",
     "crons": [{ "path": "/api/send-email", "schedule": "0 14 * * 1" }]
   }
   ```

   That is Mondays at 14:00 UTC. Cron expressions are always UTC regardless of
   `TIMEZONE`, which only affects how dates are *displayed*.

**Before you add anyone but yourself:** ask them. This system puts their replies
into a prompt, and their name and address into your environment. That is fine
between friends who agreed to it, and not fine as a surprise. The same applies
before you publish anything derived from it — see [Privacy](#privacy).

## Configuration

Everything deployment-specific lives in `lib/config.js`, read from environment
variables. `.env.example` documents all of them. Four are worth calling out:

**`PROJECT_CONTEXT`** — who the recipients are and what they are working
through, in concrete terms. This is the highest-leverage setting in the system
and it is deliberately not in the repository: written well, it describes real
people, and specific descriptions of real people do not belong in a public git
history. The built-in fallback is generic on purpose, and produces
correspondingly generic questions. That is the incentive, not a bug.

**`SUBJECT_PREFIX`** — the series name. It is also the search key used to find
prior emails, which is where all state comes from. Change it after you have
started and the system finds nothing, believes it is week 1, restarts the angle
rotation and empties every repetition guard — with no error anywhere.
`test/config.test.mjs` exists to guard exactly this.

**`INCLUDE_PROGRESS_ANCHOR`** — a fixed fourth question asked every week,
**on by default**. The three rotating questions give variety but no
comparability; a constant question is the only thing you can look back over six
months and actually measure. Set it to `false` to drop it, and override the
wording with `PROGRESS_ANCHOR_QUESTION`.

**`CRON_SECRET`** — required. Every endpoint refuses every request without it,
compared in constant time. There is no unauthenticated path.

## Customising the questions

`lib/angles.js` is the taxonomy: 20 angles, each with an `id`, a `label`, and a
`brief` telling the model what territory to work in. Edit it freely. The
rotation stride is coprime with the list length, so adding or removing entries
adapts automatically — but note that `anglesForWeek()` is a function of the week
index, so changing the list reshuffles all *future* assignments. That is
harmless; it is not a migration.

`GET /api/status` reports the next five weeks of assignments, so the rotation is
auditable rather than a black box.

## Endpoints

All three require `Authorization: Bearer $CRON_SECRET`.

| Endpoint | Sends mail? | Purpose |
| --- | --- | --- |
| `GET /api/preview` | Never | Generate and return an email. Add `?format=text` for the plain body. |
| `GET /api/status` | Never | What the system believes and what it will do next, derived live. |
| `POST /api/send-email` | Only with both switches on | Generate and send. Also the cron target. |

`/api/status` reports recipients as a **count**, never as addresses.

## Privacy

This system handles other people's private correspondence. Three things follow
from that, learned the hard way:

- **Keep `PROJECT_CONTEXT` in the environment, never in a commit.** It is the
  one field that wants to be specific about real people.
- **Never use real replies as test fixtures.** Every fixture in `test/` is
  synthetic. Real messages make better tests and make the repository
  unpublishable.
- **Scrubbing the working tree does not scrub git history.** If identifying
  detail has ever been committed to a repo you intend to publish, rewriting
  forward is not enough: the old objects stay fetchable by SHA, and forks keep
  them regardless. Start a fresh history instead. This repository has one.

## Project layout

```
api/
  send-email.js     Generate + send. Both gates checked before any model call.
  preview.js        Generate + return. Cannot send; never reads RECIPIENTS.
  status.js         Live self-report, derived from the archive.
lib/
  config.js         Every deployment-specific value, in one place.
  angles.js         The 20-angle taxonomy and its deterministic rotation.
  claude.js         Prompt construction, generation, freshness enforcement.
  gmail.js          Send, list prior sends, fetch replies.
  parse.js          Pure parsing: MIME, quote stripping, sent-email round-trip.
  state.js          Derives week-to-week state from the archive.
  urls.js           URL normalisation for the article repetition guard.
  auth.js           Constant-time bearer check on every endpoint.
test/               40 tests. No credentials, no network, no npm install.
```

## Status

This is a personal tool, published because the architecture is more interesting
than the use case. It is not a product, there is no roadmap, and nobody is on
call for it. Fork it and make it yours.

## Licence

MIT. See [LICENSE](LICENSE).
