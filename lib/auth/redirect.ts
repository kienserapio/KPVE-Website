/**
 * Endpoints a login is never allowed to bounce someone to.
 *
 * `/login?next=/logout` signs the person straight back out the moment they get
 * in — a working denial of service delivered as a link — and the portal
 * equivalent is worse, because a client would never work out why. `/api` is
 * here because a redirect into it can only ever be a mistake.
 */
const DENIED = ["/login", "/logout", "/portal/login", "/portal/logout", "/api"];

/**
 * Where a login is allowed to send someone afterwards.
 *
 * A `next` value arrives in the query string, which means it is attacker-set:
 * a link to /login?next=https://evil.example turns our own sign-in form into a
 * credible phishing hop. Only same-site paths survive, and `prefix` narrows it
 * further so a client bounced out of the portal can never be aimed at /admin.
 *
 * `//host` is a protocol-relative URL, and several browsers normalise `\` to
 * `/`, so `/\evil.example` is the same attack spelled differently. Control
 * characters are refused because a header-splitting payload has no business in
 * a path.
 *
 * The path is RESOLVED before it is judged. `/portal/../admin` starts with
 * "/portal" as a string, but the browser — and Next's own client router, which
 * does `new URL(location, current)` — turns it into `/admin`. A prefix test
 * against the raw string is testing something nobody will ever navigate to.
 */
export function safeNext(raw: unknown, prefix: string, fallback: string): string {
  const value = typeof raw === "string" ? raw : "";

  if (!value.startsWith(prefix)) return fallback;
  if (value.startsWith("//")) return fallback;
  if (value.includes("\\")) return fallback;
  if (/[\x00-\x1f\x7f]/.test(value)) return fallback;

  let url: URL;
  try {
    url = new URL(value, "http://invalid.local");
  } catch {
    return fallback;
  }

  // Dot segments cannot climb past the root, so this should be unreachable.
  // Checked anyway rather than relied upon.
  if (url.origin !== "http://invalid.local") return fallback;

  const path = url.pathname;
  if (!path.startsWith(prefix)) return fallback;
  if (DENIED.some((denied) => path === denied || path.startsWith(`${denied}/`))) {
    return fallback;
  }

  // The fragment is dropped — the server never sees one anyway.
  return path + url.search;
}
