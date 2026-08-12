import { permanentRedirect } from 'next/navigation';

// The on-chain staking page is now the main /staking page. Keep this route as a
// permanent redirect so any old links/bookmarks still land in the right place.
// `redirect` answers 307, which tells a search engine the move is temporary and
// to keep the old URL; `permanentRedirect` answers 308, which is the one that
// passes the ranking signal on to /staking and retires this URL.
export default function StakingOnchainRedirect() {
  permanentRedirect('/staking');
}
