/* eslint-disable @next/next/no-img-element */
type EyebrowProps = {
  children: React.ReactNode;
  className?: string;
};

/** Small glass pill with the Figma gold dot — the section label used across the page. */
export function Eyebrow({ children, className = "" }: EyebrowProps) {
  return (
    <span
      className={`glass inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-medium tracking-wide text-muted-3 ${className}`}
    >
      <img src="/icons/pill.svg" alt="" aria-hidden className="size-2.5" />
      {children}
    </span>
  );
}
