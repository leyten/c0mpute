/**
 * Which brand a request is served under.
 *
 * Both domains run the same deployment. compute.tech renders as Compute Network;
 * everything else keeps rendering exactly what c0mpute.ai has always rendered.
 *
 * ── THE CUTOVER SWITCH ────────────────────────────────────────────────────
 * When you are ready to make Compute Network the default everywhere, set
 *
 *     BRAND_DEFAULT=compute
 *
 * in the environment and restart. Every host then falls through to the new
 * brand, including c0mpute.ai, which is what you want at the moment you flip
 * the socials and start 301-ing the old domain. Nothing else has to change.
 * Pair it with the nginx $robots_tag switch in conf.d/00-primary-domain.conf.
 */

export type BrandId = 'compute' | 'legacy';

export interface Brand {
  id: BrandId;
  /** Full name — footer, lockups, legal surfaces. */
  name: string;
  /** Short form for tight spaces such as a narrow nav. */
  short: string;
  /** Browser tab title. */
  title: string;
  description: string;
  /** Render the Compute Network mark instead of the legacy wordmark. */
  mark: boolean;
  /** Show the legal footer bar naming the operating entity. */
  legalFooter: boolean;
  icon: string;
  /**
   * Social card and touch icon. Only the new brand ships them: the root layout
   * on c0mpute.ai has never emitted OG or Twitter tags, and must keep not
   * emitting them, so this stays undefined on the legacy brand.
   */
  social?: {
    /** Canonical origin, used to absolutize the card image. */
    url: string;
    /** Square card, 512x512. */
    ogImage: string;
    appleIcon: string;
  };
}

const COMPUTE: Brand = {
  id: 'compute',
  name: 'Compute Network',
  short: 'Compute',
  title: 'Compute Network',
  description:
    'Compute Network runs AI models across GPUs contributed by people, not datacenters. No model is held by any single machine.',
  mark: true,
  legalFooter: true,
  icon: '/brand/favicon.svg',
  social: {
    url: 'https://compute.tech',
    ogImage: '/brand/compute-og.png',
    appleIcon: '/brand/apple-touch-icon.png',
  },
};

const LEGACY: Brand = {
  id: 'legacy',
  name: 'c0mpute',
  short: 'c0mpute',
  title: 'c0mpute',
  description:
    'c0mpute: A decentralized AI built from the collective compute of its users.',
  mark: false,
  legalFooter: false,
  icon: '/favicon.ico',
};

/** Hosts that always get the new brand, regardless of the default. */
const NEW_BRAND_HOSTS = new Set(['compute.tech', 'www.compute.tech']);

/** What every other host gets. Flip via BRAND_DEFAULT to cut over. */
const DEFAULT_BRAND: Brand =
  process.env.BRAND_DEFAULT === 'compute' ? COMPUTE : LEGACY;

export function brandForHost(host?: string | null): Brand {
  const hostname = (host ?? '').split(':')[0].trim().toLowerCase();
  return NEW_BRAND_HOSTS.has(hostname) ? COMPUTE : DEFAULT_BRAND;
}

/** Safe fallback for any client component rendered outside the provider. */
export const FALLBACK_BRAND = LEGACY;
