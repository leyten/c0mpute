import { pageMetadata } from '@/lib/seo';
import { PLANS } from './plans';

// The page below is a client component and so cannot export metadata itself.
// This layout exists only to carry it; it adds nothing to the markup.
//
// The headline price is read rather than retyped: a search snippet quoting a
// price we no longer charge is the one stale number nobody on the team would
// ever notice.
const FEATURED = PLANS.find((p) => p.featured) ?? PLANS[0];

export const generateMetadata = () =>
  pageMetadata({
    title: 'Pricing',
    description:
      `One uncensored 27B model, served by a decentralized GPU network. Free every day, $${FEATURED.monthly} a month for a working day of it, and a GPU earns the subscription back.`,
    path: '/pricing',
  });

export default function PricingLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
