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
  /**
   * The homepage's title — the browser tab, and the blue line in a search
   * result. Every other page titles itself and lets the root layout append
   * `name`, so this is the one place the brand leads.
   */
  title: string;
  /** The homepage's meta description. Keep it under ~155 characters. */
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
  /**
   * Sibling properties, per brand. Both domains run the same four static
   * subdomains, so a link hardcoded to c0mpute.ai would walk a compute.tech
   * visitor off the brand mid-session. These keep every in-network link on the
   * domain the visitor arrived on.
   *
   * External destinations (GitHub, X, Telegram) are deliberately absent — those
   * accounts exist once and are not per-brand.
   */
  urls: {
    origin: string;
    docs: string;
    blog: string;
    data: string;
    shard: string;
    /** OpenAI-compatible API base, as advertised to integrators. */
    api: string;
  };
}

const COMPUTE: Brand = {
  id: 'compute',
  name: 'Compute Network',
  short: 'Compute',
  title: 'Compute Network — decentralized AI on user-owned GPUs',
  description:
    'An open protocol for decentralized AI. Run open models privately across a permissionless network of user-owned GPUs, or plug in your own GPU and get paid.',
  mark: true,
  legalFooter: true,
  icon: '/brand/favicon.svg',
  social: {
    url: 'https://compute.tech',
    ogImage: '/brand/compute-og.png',
    appleIcon: '/brand/apple-touch-icon.png',
  },
  urls: {
    origin: 'https://compute.tech',
    docs: 'https://docs.compute.tech',
    blog: 'https://blog.compute.tech',
    data: 'https://data.compute.tech',
    shard: 'https://shard.compute.tech',
    api: 'https://api.compute.tech/v1',
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
  urls: {
    origin: 'https://c0mpute.ai',
    docs: 'https://docs.c0mpute.ai',
    blog: 'https://blog.c0mpute.ai',
    data: 'https://data.c0mpute.ai',
    shard: 'https://shard.c0mpute.ai',
    api: 'https://c0mpute.ai/api/v1',
  },
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

/**
 * What a client component sees if it renders outside the provider — the
 * BrandContext default. Nothing does today: there is no global-error, error or
 * not-found boundary, and every useBrand() caller is a child of the root
 * layout. It is the default for the one that gets added later.
 *
 * It follows the cutover rather than staying pinned to the old brand. Before
 * the switch, falling back to LEGACY was the conservative answer. Now that
 * every host resolves to Compute Network, LEGACY is the one answer that is
 * certainly wrong: it would render the retired brand underneath a document
 * whose server-rendered title already says Compute Network, and two halves
 * disagreeing is worse than either being uniformly old.
 */
export const FALLBACK_BRAND = COMPUTE;
