import type { MetadataRoute } from 'next';

// The indexable surface of compute.tech, and nothing else. The app shells
// (/dashboard, /settings, /login) and the referral space (/r/<code>) are
// noindex and deliberately absent.
//
// The subdomains — docs, blog, data, shard — are separate hosts and need
// their own sitemaps submitted separately; a sitemap may only list URLs on
// the host that serves it unless every domain is verified together in Search
// Console.
const ROUTES: { path: string; priority: number }[] = [
  { path: '', priority: 1.0 },
  { path: '/chat', priority: 0.9 },
  { path: '/earn', priority: 0.9 },
  { path: '/create', priority: 0.8 },
  { path: '/staking', priority: 0.7 },
  { path: '/treasury', priority: 0.6 },
  { path: '/acceptable-use', priority: 0.3 },
  { path: '/privacy', priority: 0.3 },
  { path: '/terms', priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return ROUTES.map(({ path, priority }) => ({
    url: `https://compute.tech${path}`,
    priority,
  }));
}
