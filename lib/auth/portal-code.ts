import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/* ---------------------------------------------------------------------------
   The client's access code — the credential a KPVE staff member issues and
   hands over, once.

   Deliberately NOT marked "server-only": there is no secret in this module,
   only pure functions over node:crypto, and scripts/issue-portal-code.ts runs
   outside Next and imports it. One implementation of the format is the point —
   a second one in the CLI would drift and start minting codes that don't parse.

   Shape: 24 Crockford base32 characters, shown in six groups of four.

       KM4P-8T2X-9WQR-3FHV-6BNY-J57Z
       └───────┘ └──────────────────┘
        selector          verifier

   SELECTOR — the first 8 characters, 40 bits. Not a secret. It is a lookup key
   so signing in is one indexed row fetch. Without it the only way to find the
   right row is to compare the submitted code against every row sharing the
   submitted email, which makes verification cost proportional to a number the
   attacker chooses — a timing oracle and a CPU-exhaustion lever in one.

   VERIFIER — the remaining 16 characters, 80 bits. Only its SHA-256 is stored.
   80 bits of uniform randomness is not guessable at any request rate, and it
   is not in any dictionary, which is why this is hashed fast (SHA-256) rather
   than slowly (bcrypt). Slow hashing defends human-chosen passwords; here it
   would only hand a public endpoint a way to burn a lambda's CPU.

   Crockford base32, not hex: this gets read down a phone and typed back in.
   The alphabet has no I, L, O or U, so there is no 1/I, 0/O or hex B/D/E/3
   confusion, and normalizeAccessCode() folds the mistakes people still make.
--------------------------------------------------------------------------- */

/** Crockford base32 — 32 symbols, no I, L, O or U. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** 15 bytes is 120 bits, which is exactly 24 base32 characters — no padding. */
const CODE_BYTES = 15;
const CODE_LENGTH = 24;
const SELECTOR_LENGTH = 8;
const GROUP_SIZE = 4;

/** How long an issued code stays usable. Reissuing is one click for staff. */
export const CODE_LIFETIME_DAYS = 60;

export type IssuedAccessCode = {
  /** Shown to staff exactly once, in groups. Never stored, never logged. */
  code: string;
  selector: string;
  codeHash: string;
  expiresAt: Date;
};

function encode(bytes: Buffer): string {
  let value = 0;
  let bits = 0;
  let out = "";

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  return out;
}

/** Six groups of four, hyphenated — the form a code is read aloud in. */
export function formatAccessCode(code: string): string {
  const groups: string[] = [];
  for (let i = 0; i < code.length; i += GROUP_SIZE) {
    groups.push(code.slice(i, i + GROUP_SIZE));
  }
  return groups.join("-");
}

export function hashVerifier(verifier: string): string {
  return createHash("sha256").update(verifier).digest("hex");
}

/**
 * Mints a code. The plaintext is returned to the caller and nowhere else — the
 * database only ever sees the selector and the verifier's hash, so a lost code
 * is reissued, never recovered.
 */
export function generateAccessCode(): IssuedAccessCode {
  const code = encode(randomBytes(CODE_BYTES));
  const expiresAt = new Date(Date.now() + CODE_LIFETIME_DAYS * 24 * 60 * 60 * 1000);

  return {
    code: formatAccessCode(code),
    selector: code.slice(0, SELECTOR_LENGTH),
    codeHash: hashVerifier(code.slice(SELECTOR_LENGTH)),
    expiresAt,
  };
}

/**
 * Splits a NORMALIZED code (see normalizeAccessCode in lib/validation.ts).
 * Returns null for anything that isn't the right length — a cheap shape check
 * before touching the database, the same guard getInvoiceByToken() applies to
 * an invoice token.
 */
export function parseAccessCode(
  normalized: string,
): { selector: string; verifier: string } | null {
  if (normalized.length !== CODE_LENGTH) return null;

  return {
    selector: normalized.slice(0, SELECTOR_LENGTH),
    verifier: normalized.slice(SELECTOR_LENGTH),
  };
}

/**
 * Constant-time comparison of the submitted verifier against the stored hash.
 *
 * timingSafeEqual throws on a length mismatch, so the lengths are checked
 * first — and both sides are fixed-length hex digests, so that check leaks
 * nothing beyond "the stored value is malformed".
 */
export function verifyAccessCode(verifier: string, storedHash: string): boolean {
  const submitted = Buffer.from(hashVerifier(verifier), "hex");
  const stored = Buffer.from(storedHash, "hex");
  if (submitted.length !== stored.length) return false;

  return timingSafeEqual(submitted, stored);
}
