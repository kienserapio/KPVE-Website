import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge class names, with later Tailwind utilities correctly overriding
 * earlier ones (`px-4` + `px-6` resolves to `px-6`, not both).
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * KPVE's own timezone, pinned rather than left to the runtime.
 *
 * A Vercel lambda runs on UTC and a browser runs on whatever the laptop says,
 * so an unpinned formatter renders one string on the server and another during
 * hydration — a mismatch React warns about, and a date that is genuinely wrong
 * for anyone reading it. Invoices, bill dates and code expiries are all business
 * dates in Sydney; that is what they should say wherever they are rendered.
 */
const TIME_ZONE = "Australia/Sydney";

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: TIME_ZONE,
  }).format(new Date(date));
}

export function formatDateTime(date: Date | string): string {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  }).format(new Date(date));
}

export function formatRelative(date: Date | string): string {
  const then = new Date(date).getTime();
  const diffMs = Date.now() - then;
  const mins = Math.round(diffMs / 60000);

  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;

  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;

  return formatDate(date);
}

export function initials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

/**
 * The site's own public origin, with any trailing slash removed — a stored
 * "https://kpve.com/" would otherwise produce "//portal/login" in every link we
 * send out.
 *
 * Lives here rather than beside the payment providers that first needed it,
 * because emails need it too and lib/payments is server-only. NEXT_PUBLIC_ so
 * the value is the same one the browser was built with.
 */
export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");
}
