import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { brandForHost } from '@/lib/brand';
import { REFERRAL_CODE_RE } from '@/lib/referrals';
import RefRedirect from './redirect';

// Referral landing: c0mpute.ai/r/<code> → homepage with ?ref=<code>.
// This is a page (not a route handler) so link crawlers (Telegram, X, Discord)
// get referral-specific OG tags instead of following a redirect to the homepage.
// Humans are bounced client-side; the homepage stores the code (30 days) so
// attribution survives the anonymous try-first phase and binds at signup.

const OG_DESCRIPTION = 'private AI in a browser tab. ask anything, no account tracking, no install.';
const OG_IMAGE_PATH = '/og-referral.png';

export async function generateMetadata(
  { params }: { params: Promise<{ code: string }> }
): Promise<Metadata> {
  const { code } = await params;
  const clean = (code || '').toLowerCase().trim();
  const brand = brandForHost((await headers()).get('host'));
  const title = `you've been invited to ${brand.name}`;
  // Absolute, and on the domain the crawler actually asked for. Hardcoding the
  // old host meant a card scraped from compute.tech advertised c0mpute.ai —
  // and after the cutover that image URL is a 301, which scrapers drop.
  const origin = brand.urls.origin;
  const url = REFERRAL_CODE_RE.test(clean) ? `${origin}/r/${clean}` : origin;
  return {
    // Absolute: the invite already names the network, and the root layout's
    // template would otherwise append it a second time.
    title: { absolute: title },
    description: OG_DESCRIPTION,
    // Every referral code is its own URL, so this segment is an unbounded
    // space of near-identical pages that all bounce to the homepage. Crawlers
    // are told not to index them; link scrapers ignore robots directives and
    // still get the card below, which is the only reason this is a page.
    robots: { index: false, follow: true },
    alternates: { canonical: origin },
    openGraph: {
      title,
      description: OG_DESCRIPTION,
      url,
      siteName: brand.name,
      type: 'website',
      images: [{ url: `${origin}${OG_IMAGE_PATH}`, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: OG_DESCRIPTION,
      images: [`${origin}${OG_IMAGE_PATH}`],
    },
  };
}

export default async function ReferralPage(
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const clean = (code || '').toLowerCase().trim();
  const target = REFERRAL_CODE_RE.test(clean) ? `/?ref=${clean}` : '/';
  return <RefRedirect target={target} />;
}
