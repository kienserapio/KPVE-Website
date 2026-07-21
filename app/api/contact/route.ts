import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { contactFormSchema } from "@/lib/validation";
import { createLead } from "@/lib/dal/leads";
import { getClientIp, rateLimit } from "@/lib/rate-limit";

// Route handlers are not cached by default in Next 16, but this one must never
// be — say so explicitly since it is the site's only write endpoint.
export const dynamic = "force-dynamic";

const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_BODY_BYTES = 32 * 1024;

export async function POST(request: Request) {
  // 1. Rate limit before doing any work.
  const ip = getClientIp(request.headers);
  const limit = rateLimit(`contact:${ip}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many submissions. Please try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  // 2. Reject oversized bodies before parsing them.
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json(
      { ok: false, error: "Request too large." },
      { status: 413 },
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request body." },
      { status: 400 },
    );
  }

  // 3. Honeypot, checked before validation so the response is a plain success
  //    no matter what else is in the body. A bot must get no signal at all
  //    about which field caught it.
  if (
    typeof raw === "object" &&
    raw !== null &&
    typeof (raw as { website?: unknown }).website === "string" &&
    (raw as { website: string }).website.length > 0
  ) {
    return NextResponse.json({ ok: true }, { status: 201 });
  }

  // 4. Validate. Zod strips unknown keys, so nothing unexpected reaches the DB.
  let data;
  try {
    data = contactFormSchema.parse(raw);
  } catch (error) {
    if (error instanceof ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of error.issues) {
        const field = issue.path[0];
        if (typeof field === "string" && !fieldErrors[field]) {
          fieldErrors[field] = issue.message;
        }
      }
      return NextResponse.json(
        { ok: false, error: "Please check the highlighted fields.", fieldErrors },
        { status: 400 },
      );
    }
    throw error;
  }

  // 5. Persist.
  try {
    await createLead({
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone,
      message: data.message,
      source: data.source,
    });
  } catch (error) {
    // Log the detail server-side; never leak database internals to the client.
    console.error("[api/contact] failed to save lead", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          "We couldn't save your message. Please email us directly and we'll get straight back to you.",
      },
      { status: 500 },
    );
  }

  // Email notification will hook in here once Resend is configured. It must be
  // wrapped so a send failure cannot fail a lead that is already saved.

  return NextResponse.json({ ok: true }, { status: 201 });
}
