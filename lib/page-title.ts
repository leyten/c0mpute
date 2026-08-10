import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { brandForHost } from './brand';

/**
 * The tab title for one page, per brand.
 *
 * Compute Network names every surface the same way — `Compute Network / Chat`,
 * `Compute Network / Earn` — so a reader with a row of tabs open can see which
 * network they belong to before reading a word. The homepage is the exception
 * and carries no slash; it gets its title from the root layout.
 *
 * c0mpute.ai keeps exactly what it served before. That is `legacy` on the three
 * legal pages, which set their own title, and nothing at all everywhere else,
 * where the page inherited the root layout's plain `c0mpute`. Returning an
 * empty object is how you say "inherit": Next merges metadata field by field
 * down the segment tree, so a title this function does not set is the parent's.
 *
 * Most pages in this app are `'use client'` and so cannot export metadata at
 * all. They call this from a sibling `layout.tsx`, which is a server component
 * and can read the Host header.
 */
export async function pageMetadata(page: string, legacy?: string): Promise<Metadata> {
  const brand = brandForHost((await headers()).get('host'));
  if (brand.id === 'compute') return { title: `${brand.name} / ${page}` };
  return legacy ? { title: legacy } : {};
}
