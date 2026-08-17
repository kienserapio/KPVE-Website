/* ---------------------------------------------------------------------------
   The loader every route falls back to while its server components stream.

   Why it exists: pages here are server-rendered on demand, so a click on
   "Invoices" does nothing visible until the RSC payload arrives — the old page
   just sits there, and a page that sits there reads as a page that ignored you.
   A `loading.tsx` per segment turns that dead time into an immediate, honest
   "working on it".

   Deliberately not a skeleton. A skeleton is a promise about the shape of what's
   coming, and these pages differ too much for one to be true; a mark that spins
   in the middle of the canvas is a promise it can keep. It is also prefetched
   with the route, so it must stay cheap — no images, no fonts, no state.

   Pure CSS animation, no JS: this renders as a Suspense fallback, before the
   page's own JavaScript is anywhere near the browser.
--------------------------------------------------------------------------- */

export function PageLoader({
  label = "Loading",
  /**
   * "admin" resolves the --admin-* tokens the dashboard runs on; "brand" is for
   * the public site and the client-facing pages, which use the marketing
   * palette. Same shape either way — only the colours move.
   */
  variant = "admin",
}: {
  label?: string;
  variant?: "admin" | "brand";
}) {
  const ring =
    variant === "admin"
      ? "border-[var(--admin-border-strong)] border-t-[var(--admin-accent)]"
      : "border-line-2 border-t-gold-bright";
  const text = variant === "admin" ? "text-[var(--admin-fg-subtle)]" : "text-muted";

  return (
    // min-h from the viewport minus a little chrome, so it centres in the
    // canvas rather than clinging to the top of an otherwise empty page.
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[60vh] w-full flex-col items-center justify-center gap-4"
    >
      <span
        aria-hidden
        className={`size-9 animate-spin rounded-full border-2 ${ring}`}
      />
      {/* Visible to screen readers, invisible to everyone else: the spinner is
          the message, and a word under it would just be noise on every click. */}
      <span className={`sr-only ${text}`}>{label}…</span>
    </div>
  );
}
