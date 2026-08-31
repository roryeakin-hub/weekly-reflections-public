# Setup

About twenty minutes, most of it waiting on Google's consent screen.

Nothing in this guide causes an email to be sent. Sending is gated separately —
see [README → Turning sending on](README.md#turning-sending-on).

---

## Step 0 — Verify the machinery first (2 min)

```bash
git clone https://github.com/<you>/weekly-reflections-public.git
cd weekly-reflections-public
npm test
```

40 tests, no credentials and no network needed. If they pass, the parsing,
rotation and configuration logic is sound and any later problem is
credentials or deployment.

## Step 1 — Gmail OAuth (~15 min, one-time)

The system needs to **send** as your address and **read** the resulting threads.
Reading is not optional: the mail archive is the entire memory mechanism. There
is no database to fall back on.

### 1a — Google Cloud project

1. <https://console.cloud.google.com> → new project
2. APIs & Services → Library → enable **Gmail API**

### 1b — OAuth consent screen

1. User type **External**
2. Add your sending address as a test user
3. Scopes: `https://www.googleapis.com/auth/gmail.send` and
   `https://www.googleapis.com/auth/gmail.readonly`

A project in "Testing" mode issues refresh tokens that expire after seven days.
For a system that runs weekly, that is a guaranteed silent failure. **Publish
the app** (consent screen → Publish) even though you are the only user. It stays
unverified, which is fine for your own account, and the token stops expiring.

### 1c — Credentials

1. Credentials → Create → **OAuth client ID** → Desktop app
2. Note the client ID and client secret

### 1d — Get a refresh token

```bash
npm install googleapis
node -e "
const {google} = require('googleapis');
const c = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  'urn:ietf:wg:oauth:2.0:oob'
);
console.log(c.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: ['https://www.googleapis.com/auth/gmail.send',
          'https://www.googleapis.com/auth/gmail.readonly']
}));
"
```

Open the URL as your sending address and authorize. `access_type: 'offline'`
and `prompt: 'consent'` are both required — without them you get an access
token that expires in an hour and no refresh token at all.

Exchange the resulting code:

```bash
node -e "
const {google} = require('googleapis');
const c = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  'urn:ietf:wg:oauth:2.0:oob'
);
c.getToken(process.argv[1]).then(r => console.log(r.tokens.refresh_token));
" "<paste the code here>"
```

Save that refresh token. It is shown once.

## Step 2 — Anthropic API key

<https://console.anthropic.com> → API keys. The weekly run makes one call with
server-side web search enabled.

## Step 3 — Deploy

```bash
npm i -g vercel
vercel
```

Then set environment variables (Vercel → Project → Settings → Environment
Variables), using `.env.example` as the checklist:

| Variable | Required | Notes |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | yes | |
| `GMAIL_CLIENT_ID` | yes | |
| `GMAIL_CLIENT_SECRET` | yes | |
| `GMAIL_REFRESH_TOKEN` | yes | |
| `SENDER_EMAIL` | yes | |
| `CRON_SECRET` | yes | `openssl rand -hex 32` — everything is refused without it |
| `PROJECT_CONTEXT` | strongly recommended | See below |
| `SUBJECT_PREFIX` | no | Defaults to `Weekly Reflection`. Do not change after starting. |
| `TIMEZONE` | no | Defaults to UTC |
| `SENDING_ENABLED` | leave unset for now | |
| `RECIPIENTS` | leave unset for now | |

### On `PROJECT_CONTEXT`

Describe who the recipients are and what they are actually working through, in
concrete terms — the more specific, the better the questions. Two or three
sentences is enough.

It lives in the environment and not in the repository deliberately. Written
well, it is a specific description of real people, which is exactly the kind of
thing that should not end up in a git history you might later publish.

Without it the code falls back to a generic description and the output gets
noticeably blander. If your first preview reads like a management newsletter,
this is almost always why.

## Step 4 — Preview

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
     "https://<your-deployment>/api/preview?format=text"
```

This generates a complete email and returns it. It never reads `RECIPIENTS`, so
it cannot send. Iterate here — on `PROJECT_CONTEXT`, on the taxonomy in
`lib/angles.js` — until the output is something you would actually want to
receive. There is no reason to rush this; the loop is seconds long, and it used
to be a week.

Check what the system believes about itself:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
     "https://<your-deployment>/api/status" | jq
```

## Step 5 — Go live

Only when the previews are good, and only after asking the people you are about
to add. See [README → Turning sending on](README.md#turning-sending-on) for the
two switches and the cron schedule.

---

## Troubleshooting

**Everything returns 401** — `CRON_SECRET` is unset, or your `Authorization`
header does not read exactly `Bearer <secret>`. There is no unauthenticated
path; this is intentional.

**`/api/send-email` returns `{"sent": false}`** — working as designed. The
`reason` field names the missing switch.

**Status shows `priorSends: 0` after you have sent emails** — `SUBJECT_PREFIX`
no longer matches the subject lines in the archive. This is the one failure that
looks like nothing is wrong: the system will happily restart at week 1 and reuse
every quote and question. Set it back.

**Replies are not being picked up** — replies must go to `SENDER_EMAIL` and stay
on the original thread. A reply that starts a new thread is invisible. Check
`repliesFound` on `/api/status`.

**Generation fails intermittently with an empty response** — check
`max_tokens` in `lib/claude.js`. Server-side web search results count against
the same budget as the output; too low a limit lets search starve the response.

**Refresh token stopped working after a week** — the consent screen is still in
"Testing". See step 1b.
