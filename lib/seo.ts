import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { brandForHost } from './brand';

/**
 * The search-facing metadata for one page, per brand.
 *
 * Three things only a page knows: the title it should carry into a search
 * result, the sentence that sits under it, and the single URL it wants to be
 * indexed under. The root layout owns everything brand-wide — metadataBase,
 * icons, the title template, the social card.
 *
 * Titles lead with what the page is about and let the root layout's template
 * append the brand: `Get paid for your idle GPU — Compute Network`. A row of
 * tabs still says which network it belongs to, but the words a searcher typed
 * come first, which is the half of the title a result actually gets judged on.
 *
 * c0mpute.ai keeps exactly what it served before: `legacy` on the three legal
 * pages, which set their own title, and nothing at all everywhere else, where
 * the page inherited the root layout's plain `c0mpute`. Returning no title is
 * how you say "inherit" — Next merges metadata field by field down the segment
 * tree. The social block is gated the same way the root layout gates it, so
 * the legacy brand still emits no OG or Twitter tags. `canonical` is the one
 * tag both brands get: it is what tells Google the www and query-string
 * variants of a URL are the same page.
 *
 * Most pages in this app are `'use client'` and so cannot export metadata at
 * all. They call this from a sibling `layout.tsx`, which is a server component
 * and can read the Host header.
 */
export async function pageMetadata({
  title,
  description,
  path,
  index = true,
  legacy,
}: {
  /** Leads the title; the root layout appends the brand. */
  title: string;
  /** Omitted on the noindex surfaces, which will never be shown in a result. */
  description?: string;
  /** Absolute path with a leading slash, no trailing slash. */
  path: string;
  /** False for app shells and user-specific surfaces. */
  index?: boolean;
  /** What c0mpute.ai titled this page, where it titled it at all. */
  legacy?: string;
}): Promise<Metadata> {
  const brand = brandForHost((await headers()).get('host'));
  const url = `${brand.urls.origin}${path}`;
  const robots = index ? {} : { robots: { index: false, follow: true } };

  if (brand.id !== 'compute') {
    return { ...(legacy ? { title: legacy } : {}), alternates: { canonical: url }, ...robots };
  }

  const base: Metadata = {
    title,
    description,
    alternates: { canonical: url },
    ...robots,
  };
  if (!brand.social) return base;

  return {
    ...base,
    openGraph: {
      title,
      description,
      url,
      siteName: brand.name,
      type: 'website',
      images: [{ url: brand.social.ogImage, width: 512, height: 512, alt: brand.name }],
    },
    twitter: { card: 'summary', title, description, images: [brand.social.ogImage] },
  };
}
