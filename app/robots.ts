import type { MetadataRoute } from "next";

/**
 * The marketing site is the only part of this app that belongs in an index.
 *
 * Every private route already carries `robots: { index: false, follow: false }`
 * in its metadata, but that only helps once a crawler has fetched the page —
 * and /invoice/<token> and /pay/<ref> carry a credential in the URL. This keeps
 * well-behaved crawlers from requesting them at all.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/portal", "/invoice", "/pay", "/login", "/logout"],
    },
  };
}
