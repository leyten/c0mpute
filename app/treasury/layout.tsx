import { pageMetadata } from '@/lib/seo';

// The page below is a client component and so cannot export metadata itself.
// This layout exists only to carry it; it adds nothing to the markup.
export const generateMetadata = () =>
  pageMetadata({
    title: 'Network treasury and buyback receipts',
    description:
      'Live receipts from the network treasury: revenue collected, $ZERO bought back and burned, and rewards paid out to stakers.',
    path: '/treasury',
  });

export default function TreasuryLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
