'use client';

// The three audience doors, re-set as the reference's bento: a 12-column grid
// with 8/4 spans and fixed desktop row height, hairline cards, the living
// canvas art riding in each card. Copy is the doors' own, unchanged.
import BuildIdle from '../BuildIdle';
import CoinsIdle from '../CoinsIdle';
import GlobeMini from '../GlobeMini';
import Reveal from './Reveal';
import CornerMarks from './CornerMarks';
import { useBrand } from '@/components/BrandProvider';

function Card({
  id, span, eyebrow, title, body, links, cta, art, artSide = false,
}: {
  id: string;
  span: string;
  eyebrow: string;
  title: React.ReactNode;
  body: React.ReactNode;
  links: { href: string; text: string; external?: boolean }[];
  cta: { href: string; text: React.ReactNode; external?: boolean };
  art: React.ReactNode;
  /** true: art on the right half; false: art below the copy. */
  artSide?: boolean;
}) {
  return (
    <div
      id={id}
      className={`rv relative rounded-xl border border-fg/10 bg-fg/[0.02] hover:bg-fg/[0.04] transition-colors overflow-hidden flex ${
        artSide ? 'flex-col lg:flex-row' : 'flex-col'
      } ${span}`}
    >
      <div className="p-6 md:p-8 flex flex-col min-w-0 flex-1">
        <div className="pixel-sans text-fg-40 text-xs tracking-widest mb-3">{eyebrow}</div>
        <h3 className="pixel-serif text-fg text-2xl md:text-3xl leading-tight">{title}</h3>
        <p className="pixel-sans text-fg-70 text-sm mt-3 leading-relaxed max-w-md">{body}</p>
        <div className="mt-4 flex flex-col gap-2">
          {links.map((l) => (
            <a
              key={l.text}
              href={l.href}
              {...(l.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              className="cursor-pointer pixel-sans text-steel-50 light:text-steel hover:text-steel text-sm transition-colors"
            >
              {l.text}
            </a>
          ))}
        </div>
        <div className="pt-6 mt-auto">
          <a
            href={cta.href}
            {...(cta.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            className="hdr-btn pixel-sans text-sm font-medium"
          >
            <span>{cta.text}</span>
          </a>
        </div>
      </div>
      <div
        className={
          artSide
            ? 'relative min-h-[200px] lg:min-h-0 lg:w-[42%] shrink-0 p-4 md:p-6'
            : 'relative flex-1 min-h-0 max-lg:min-h-[160px] px-4 pb-4'
        }
      >
        {art}
      </div>
    </div>
  );
}

export default function BentoDoors() {
  const brand = useBrand();
  return (
    <section id="doors" className="px-4 md:px-6 mt-4 md:mt-8">
      <Reveal className="max-w-[1080px] mx-auto text-center">
        <h2 className="rv pixel-serif text-fg text-3xl md:text-5xl">Pick your door</h2>
      </Reveal>
      <Reveal className="relative max-w-[1200px] mx-auto mt-8 md:mt-12 grid grid-cols-1 lg:grid-cols-12 gap-2 lg:auto-rows-[440px]">
        <CornerMarks />
        <Card
          id="developers"
          span="lg:col-span-8"
          artSide
          eyebrow="FOR DEVELOPERS"
          title="Build on the network"
          body="One API, served by a network instead of a data center. Every response is backed by the receipts underneath it. The v1 endpoint answers today, and the betanet API opens at launch."
          links={[
            { href: '/chat', text: 'Try it live →' },
            { href: `${brand.urls.docs}/api`, text: 'Betanet API →', external: true },
          ]}
          cta={{ href: brand.urls.docs, text: 'Read the docs', external: true }}
          art={<div className="w-full h-full min-h-[180px]"><BuildIdle /></div>}
        />
        <Card
          id="gpu-owners"
          span="lg:col-span-4"
          eyebrow="FOR GPU OWNERS"
          title="Plug in, get paid"
          body="Your idle hardware earns USDC for real work: from a browser tab today, a full node when the betanet opens. Leave whenever you want."
          links={[{ href: '/earn', text: 'Earn in your browser →' }]}
          cta={{ href: '/earn', text: 'Start earning' }}
          art={<div className="w-full h-full"><CoinsIdle /></div>}
        />
        <Card
          id="community"
          span="lg:col-span-12"
          artSide
          eyebrow="FOR THE OPEN-MODEL COMMUNITY"
          title="Own a piece"
          body={
            <>
              Open models need open infrastructure to run on. Network revenue funds the treasury: half
              burns <span className="dollar">$</span>ZERO, half pays the people who stake it.
            </>
          }
          links={[
            { href: '/treasury', text: 'Treasury →' },
            { href: brand.urls.data, text: 'Network data →', external: true },
          ]}
          cta={{ href: '/staking', text: <>Explore <span className="dollar">$</span>ZERO</> }}
          art={<div className="w-full h-full min-h-[200px]"><GlobeMini /></div>}
        />
      </Reveal>
    </section>
  );
}
