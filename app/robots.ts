import type { MetadataRoute } from 'next';

// Cloudflare prepends its managed block to whatever the origin returns rather
// than replacing it — measured on docs.compute.tech, where the edge body is
// exactly the managed block plus the origin's, byte for byte. So this file is
// served, and the Sitemap: line below reaches a crawler. What survives the
// merge is Cloudflare's own AI-crawler Disallow list, which can only be
// changed in the dashboard.
//
// Only /api is disallowed. The private surfaces (/dashboard, /settings,
// /login, /r/<code>) carry a noindex meta tag instead — a crawler has to be
// allowed to fetch a page in order to see that it is noindex, and blocking
// them here would leave the referral URLs indexable as bare links.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: '/api/' }],
    sitemap: 'https://compute.tech/sitemap.xml',
  };
}
