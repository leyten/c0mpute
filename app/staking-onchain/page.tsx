import { redirect } from 'next/navigation';

// The on-chain staking page is now the main /staking page. Keep this route as a
// permanent redirect so any old links/bookmarks still land in the right place.
export default function StakingOnchainRedirect() {
  redirect('/staking');
}
