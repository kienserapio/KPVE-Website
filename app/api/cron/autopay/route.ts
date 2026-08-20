import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { runAutopay } from "@/lib/autopay/run";
import { paymentsAreSimulated } from "@/lib/payments";

/* ---------------------------------------------------------------------------
   The nightly AutoPay run.

   Unauthenticated in the session sense — a scheduler has no cookie — so the
   bearer token IS the authorization, exactly as the HMAC is for the Stripe
   webhook. This route takes money from people's cards; treat every request as
   hostile until the token matches.

   To switch it on:
     1. set CRON_SECRET in the environment (Vercel sends it as a bearer token
        on its own cron invocations),
     2. keep the schedule in vercel.json pointed here,
     3. turn AutoPay on in /admin/settings — the kill switch is in the database
        rather than the env so it can be flipped without a deploy.

   All three must be true. Any one of them off and this route does nothing.

   By hand:
     curl -H "Authorization: Bearer $CRON_SECRET" \
       "$NEXT_PUBLIC_APP_URL/api/cron/autopay?dryRun=1"
--------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

/**
 * A run charges up to the per-run cap one card at a time, each a round trip to
 * Stripe. Sixty seconds is generous for the twenty-five that cap allows; the
 * point of setting it at all is that a hung provider ends the request rather
 * than the platform's default.
 */
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Not a 200. A scheduler that thinks it is running AutoPay every night
    // while nothing happens is worse than a loud failure.
    console.error("[cron/autopay] CRON_SECRET is not set — request rejected");
    return NextResponse.json({ error: "Cron not configured" }, { status: 503 });
  }

  if (!authorized(request.headers.get("authorization"), secret)) {
    console.warn("[cron/autopay] rejected a request with a bad or missing token");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const dryRun = params.get("dryRun") === "1";

  let asOf: Date;
  try {
    asOf = resolveAsOf(params.get("asOf"));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Bad request" },
      { status: 400 },
    );
  }

  try {
    const summary = await runAutopay({ asOf, dryRun });
    console.info("[cron/autopay]", JSON.stringify(summary));
    return NextResponse.json(summary, { status: 200 });
  } catch (error) {
    console.error("[cron/autopay] run failed", error);
    return NextResponse.json({ error: "Run failed" }, { status: 500 });
  }
}

/**
 * Constant-time comparison, and length-checked first because timingSafeEqual
 * throws on a mismatch — which would itself leak the length.
 */
function authorized(header: string | null, secret: string): boolean {
  if (!header?.startsWith("Bearer ")) return false;

  const provided = Buffer.from(header.slice("Bearer ".length));
  const expected = Buffer.from(secret);
  if (provided.length !== expected.length) return false;

  return timingSafeEqual(provided, expected);
}

/**
 * `?asOf=2026-09-15` moves the run's idea of today, which is how the whole
 * feature gets tested without waiting a month for a due date.
 *
 * Refused outright when real money is in play. A future date turns "invoices
 * due today" into "every invoice due this year", and someone holding the cron
 * token should not be able to bring a quarter's billing forward with a query
 * string. In simulated mode nothing can move, so it is allowed.
 */
function resolveAsOf(raw: string | null): Date {
  if (!raw) return new Date();

  if (!paymentsAreSimulated() && process.env.AUTOPAY_ALLOW_AS_OF !== "1") {
    throw new Error("asOf is only allowed while payments are simulated");
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error("asOf must be YYYY-MM-DD");

  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) throw new Error("asOf must be a real date");

  return parsed;
}
