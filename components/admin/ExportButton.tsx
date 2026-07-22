/**
 * A plain download link — the CSV route sets Content-Disposition, so a normal
 * anchor triggers the download. `download` hints the filename for same-origin.
 */
export function ExportButton({ href, label = "Export CSV" }: { href: string; label?: string }) {
  return (
    <a
      href={href}
      download
      className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-[var(--admin-border-strong)] bg-[var(--admin-surface)] px-4 py-2.5 text-sm font-medium text-[var(--admin-fg)] transition hover:bg-[var(--admin-surface-2)]"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4">
        <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
      </svg>
      {label}
    </a>
  );
}
