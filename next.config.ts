import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Applied to every response.
   *
   * Referrer-Policy is the load-bearing one: an invoice lives at
   * /invoice/<token> where the token IS the credential, and the default
   * referrer behaviour would hand that whole URL to any external site a client
   * clicks through to. `strict-origin-when-cross-origin` sends the origin only.
   *
   * The rest are the cheap standards — no MIME sniffing, no framing from
   * anywhere else (the portal has a Pay now button, and a button worth
   * clickjacking should not be frameable), and HSTS so a downgrade can't strip
   * the TLS the session cookie assumes.
   *
   * SAMEORIGIN rather than DENY: the admin invoice screen previews its own PDF
   * in an iframe, and DENY blocks that too — it refuses framing by anyone,
   * including us.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          // The modern spelling of the same rule, for browsers that prefer it.
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
