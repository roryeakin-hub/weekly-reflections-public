import { timingSafeEqual } from "node:crypto";

/**
 * Accept either a genuine Vercel cron invocation or a manual call carrying
 * CRON_SECRET.
 *
 * Vercel signs cron requests with an Authorization header equal to
 * `Bearer ${CRON_SECRET}` when that variable is set. The previous code also
 * accepted the mere presence of an `x-vercel-cron-schedule` header as proof of
 * a cron invocation — that header is client-settable, so anyone who found the
 * deployment URL could trigger a send by adding it. Requiring the secret in
 * all cases closes that.
 */
export function authorize(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("CRON_SECRET is not set — refusing all requests.");
    return false;
  }

  const provided = req.headers.authorization || "";
  const expected = `Bearer ${secret}`;

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
