import type { Brand } from '@/lib/brand';

// "Compute" is an ordinary English word, so a search engine has no reason to
// read it as the name of anything. These two nodes are the machine-readable
// claim that it is: an Organization with a name, a logo and a set of profiles
// that corroborate it, and a WebSite that ties the name to this origin.
// That is what a brand query needs in order to resolve to us rather than to
// the dictionary sense of the word.
//
// The profiles are the ones the footer already links. They are the evidence
// half of the claim — an entity is only as identifiable as the accounts that
// independently point back at it.
const PROFILES = [
  'https://x.com/c0mputeAI',
  'https://t.me/c0mputeAI',
  'https://github.com/leyten/shard',
];

export default function StructuredData({ brand }: { brand: Brand }) {
  const origin = brand.urls.origin;

  const graph = [
    {
      '@type': 'Organization',
      '@id': `${origin}/#organization`,
      name: 'Compute Network Inc.',
      alternateName: brand.name,
      url: origin,
      logo: `${origin}${brand.social?.ogImage ?? ''}`,
      description: brand.description,
      sameAs: PROFILES,
    },
    {
      '@type': 'WebSite',
      '@id': `${origin}/#website`,
      name: brand.name,
      url: origin,
      publisher: { '@id': `${origin}/#organization` },
    },
  ];

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }),
      }}
    />
  );
}
