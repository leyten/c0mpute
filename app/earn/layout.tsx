import { pageMetadata } from '@/lib/seo';

// The page below is a client component and so cannot export metadata itself.
// This layout exists only to carry it; it adds nothing to the markup.
export const generateMetadata = () =>
  pageMetadata({
    title: 'Earn',
    description:
      'Turn idle GPU time into USDC. Contribute compute from a browser tab today, or a full node when betanet opens, and stop whenever you want.',
    path: '/earn',
  });

export default function EarnLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
