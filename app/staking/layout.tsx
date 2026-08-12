import { pageMetadata } from '@/lib/seo';

// The page below is a client component and so cannot export metadata itself.
// This layout exists only to carry it; it adds nothing to the markup.
export const generateMetadata = () =>
  pageMetadata({
    title: 'Stake $ZERO and earn a share of network revenue',
    description:
      'Half of what the network earns buys back and burns $ZERO. The other half pays the people who stake it. Stake, unstake, and track rewards.',
    path: '/staking',
  });

export default function StakingLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
