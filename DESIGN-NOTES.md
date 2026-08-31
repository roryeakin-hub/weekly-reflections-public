# Design notes — why it is built this way

Every structural decision in this codebase is a reaction to a specific failure
in the version before it. This document is that record. It is written as an
engineering post-mortem rather than a rationale because the failures are more
instructive than the fixes, and because one of them is a genuinely good example
of a class of bug that is very hard to see.

Names and message contents have been removed; the engineering content is
unchanged.

---

## The failure that ran for ten weeks

Over roughly two months the first version sent four real emails and received
five substantive replies. **None of those replies were ever read by the
system.** The feedback loop advertised in every email — *"your responses help
shape next week's questions"* — never executed a single time.

It was invisible because the one observable output, the email itself, kept
arriving.

### Evidence

State lived in a hosted key-value store. Its final metrics:

```
itemCount:   0
sizeInBytes: 2
digest:      e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

That digest is the SHA-256 of the empty string. The store had never been
successfully written, and its `updatedAt` predated the most recent send — which
therefore had not written either.

### Mechanism

```
readMemory()  →  store read fails  →  catch  →  defaultMemory()
```

The read swallowed its own failure and returned defaults. Every week the
generator started from `weekNumber: 0`, empty `usedQuotes`, empty
`usedQuestions`, empty `cumulativeLearnings`. Three consequences:

1. **The feedback block never rendered.** It was conditional on
   `cumulativeLearnings` being non-empty. It never was, so the section was
   absent from every prompt ever sent.
2. **The repetition guards were always empty strings.** The prompt said, every
   single week, `Do NOT reuse these quotes: none yet`.
3. **Reply processing exited immediately**, returning
   `{skipped: true, reason: "No thread yet"}` on every invocation, because the
   last thread ID was always `null`.

### Root cause of the write failure

Writes went through the provider's REST API using an account-scoped token. A
token created fresh from the same account returned 404 on the store and
`forbidden` on listing: the provider's current token format is scoped, and
write access to that store is not in the default grant. The production token had
been rotated shortly before, and almost certainly had the same gap.

The setup guide's troubleshooting section, written before the system was ever
deployed, ended with:

> **Store write failing**: confirm the API token has write access…

The correct diagnosis was written down in advance. Nothing surfaced the
condition, so nobody looked.

### Why nobody noticed

The send handler sent the email at line 31 and wrote state at line 50. The write
threw and the handler returned 500 — *after* the mail had already been
delivered. The only signal was an HTTP status code on a cron invocation nobody
reads, in logs discarded within days by the hosting tier.

**The generalisable lesson:** a failure that occurs after the user-visible
side effect is invisible, no matter how loudly it throws. If the observable
output still appears, the error has no audience.

## The observable symptom nobody connected to the cause

Every opening question the first version ever sent:

| Question 1 |
| --- |
| "If you listed your actual time…" |
| "If you knew you'd be doing your current…" |
| "If you ranked your calendar over the past month by hours spent…" |
| "If you reviewed last month's calendar with the names redacted…" |

Every one opens *"If you"*. Three are the same calendar-audit question.

This is not model failure. It is the deterministic fixed point of an unchanging
prompt whose angle list led with *"gap between stated vs revealed
preferences"*. Both recipients independently flagged it as repetitive within two
days of each other. Both were describing the steady state, not a bad week — and
the steady state was the only state the system had ever been in, because its
memory had never once been populated.

One recipient also predicted the deeper failure: that out-of-band notes
addressed to the generator would be ignored. Right about the outcome, wrong
about the reason. The analysis function explicitly asked for "explicit
preferences or requests" and would have caught it. It simply never ran.

---

## What changed, and why

| Problem | Fix |
| --- | --- |
| State in a store that silently refused writes | State derived from the mail archive on every run. No store, no token, no drift. Self-healing: a failed week costs nothing. |
| Silent failure after a side effect | Nothing to persist after sending. `/api/status` reports `feedbackLoopActive` from live data, so the claim can be checked rather than assumed. |
| Repetition prevented by asking the model nicely | A 20-angle taxonomy with deterministic rotation. Three assigned angles per week; no angle recurs within five weeks. The model does not choose. |
| Article freshness requested in the prompt | Enforced in code after generation, with up to three attempts, and the search window widened from 7 to 30 days so consecutive runs stop drawing from the same pool. |
| Rolling summary rewritten weekly ("replace, don't append") | Raw replies go into the prompt verbatim, recomputed from source each week. No compaction, so no decay of explicit instructions. |
| 3 of 4 analysis outputs computed, stored, never read | Removed. |
| Reply parser one MIME level deep | Recursive walk. A reply with an attachment previously parsed to `""` and was silently dropped. |
| Quoted-text stripper dropped any line starting with `On ` | Anchored on the full attribution pattern. The old filter survived one real reply only because the sender happened to type a lowercase "on 1)". |
| A client-settable header accepted as authentication | All endpoints require `CRON_SECRET`, compared in constant time. |
| A paused turn from server-side web search parsed as empty | The partial assistant message is handed back and text accumulated across turns. This alone was stopping roughly half of all generations. |
| Malformed generation produced a blank email reporting success | Parse failures throw. |
| Only way to see output was to wait until Monday | `/api/preview` generates without sending. |
| Real archived messages used as test fixtures | Synthetic fixtures preserving the same structural properties. Real ones make the repository unpublishable. |
| Subject prefix defined in two places, and also the state key | Single definition in `lib/config.js`, with a test asserting the outgoing subject and the archive query cannot drift apart. |
| Sending enabled by default | Two independent off-by-default switches, both checked before any model call, and no cron schedule in the committed config. |

---

## A decision that got reversed

The rewrite initially replaced a fixed weekly question — *"What changed this
week to move you toward your goals?"* — with three rotating angles, and made
restoring it an opt-in flag.

That was wrong, and it is worth naming why, because the mistake generalises.
Repetitiveness was the loud, visible complaint, so the fix optimised against it.
But the fixed question was the actual accountability mechanism and the only
constant measure across weeks. Trading it for variety bought a more interesting
email at the cost of the one property that made the series cumulative — and that
cost is invisible in any single week, which is precisely why it weighed nothing
at the time.

The anchor is now on by default. `INCLUDE_PROGRESS_ANCHOR=false` drops it.
