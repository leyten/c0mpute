import type { Metadata } from 'next';
import { REFERRAL_CODE_RE } from '@/lib/referrals';
import RefRedirect from './redirect';

// Referral landing: c0mpute.ai/r/<code> → homepage with ?ref=<code>.
// This is a page (not a route handler) so link crawlers (Telegram, X, Discord)
// get referral-specific OG tags instead of following a redirect to the homepage.
// Humans are bounced client-side; the homepage stores the code (30 days) so
// attribution survives the anonymous try-first phase and binds at signup.

const OG_TITLE = "you've been invited to c0mpute";
const OG_DESCRIPTION = 'private, uncensored AI in a browser tab. no account tracking, no content police, no install.';
const OG_IMAGE = 'https://c0mpute.ai/og-referral.png';

export async function generateMetadata(
  { params }: { params: Promise<{ code: string }> }
): Promise<Metadata> {
  const { code } = await params;
  const clean = (code || '').toLowerCase().trim();
  const url = REFERRAL_CODE_RE.test(clean) ? `https://c0mpute.ai/r/${clean}` : 'https://c0mpute.ai';
  return {
    title: OG_TITLE,
    description: OG_DESCRIPTION,
    openGraph: {
      title: OG_TITLE,
      description: OG_DESCRIPTION,
      url,
      siteName: 'c0mpute',
      type: 'website',
      images: [{ url: OG_IMAGE, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title: OG_TITLE,
      description: OG_DESCRIPTION,
      images: [OG_IMAGE],
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
