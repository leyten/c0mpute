// Three audience doors, rebuilt as full-width editorial panels: big serif
// heading + the living card art, alternating sides. Every CTA lands on an
// existing surface.
import BuildIdle from './BuildIdle';
import CoinsIdle from './CoinsIdle';
import GlobeMini from './GlobeMini';
import { useBrand } from '@/components/BrandProvider';

function Panel({
  id, eyebrow, title, body, links, cta, art, flip,
}: {
  id: string;
  eyebrow: string;
  title: React.ReactNode;
  body: React.ReactNode;
  links: { href: string; text: string; external?: boolean }[];
  cta: { href: string; text: React.ReactNode; external?: boolean };
  art: React.ReactNode;
  flip?: boolean;
}) {
  return (
    <div id={id} className="border border-fg/10 bg-fg/[0.02] rounded-3xl overflow-hidden hover:bg-fg/[0.04] transition-colors">
      <div className={`grid grid-cols-1 md:grid-cols-2 items-stretch`}>
        <div className={`p-7 md:p-12 flex flex-col ${flip ? 'md:order-2' : ''}`}>
          <div className="pixel-sans text-fg-40 text-xs tracking-widest mb-4">{eyebrow}</div>
          <h3 className="pixel-serif text-fg text-2xl md:text-4xl leading-tight">{title}</h3>
          <p className="pixel-sans text-fg-70 text-sm md:text-base mt-4 leading-relaxed max-w-md">{body}</p>
          <div className="mt-6 flex flex-col gap-2.5">
            {links.map((l) => (
              <a key={l.text} href={l.href}
                {...(l.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                className="cursor-pointer pixel-sans text-steel-50 light:text-steel hover:text-steel text-sm transition-colors">
                {l.text}
              </a>
            ))}
          </div>
          <div className="pt-8 mt-auto">
            <a href={cta.href}
              {...(cta.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              className="cursor-pointer pixel-serif-logo text-sm px-5 py-2.5 border border-fg/20 rounded-lg text-fg hover:bg-fg/5 transition-colors inline-block">
              {cta.text}
            </a>
          </div>
        </div>
        <div className={`relative min-h-[220px] md:min-h-[300px] flex items-center justify-center p-6 md:p-10 ${flip ? 'md:order-1 md:border-r' : 'md:border-l'} border-t md:border-t-0 border-fg/10`}>
          {art}
        </div>
      </div>
    </div>
  );
}

export default function Doors() {
  const brand = useBrand();
  return (
    <section id="doors" className="bg-background py-16 md:py-24 border-t border-fg/5">
      <div className="max-w-6xl mx-auto px-4 md:px-6">
        <div className="text-center mb-12 md:mb-16">
          <h2 className="pixel-serif text-fg text-3xl md:text-4xl lg:text-5xl">Pick your door</h2>
        </div>
        <div className="flex flex-col gap-6 md:gap-8">
          <Panel
            id="developers"
            eyebrow="FOR DEVELOPERS"
            title="Build on the network"
            body="One API, served by a network instead of a data center. Every response is backed by the receipts underneath it. The v1 endpoint answers today, and the betanet API opens at launch."
            links={[
              { href: '/chat', text: 'Try it live →' },
              { href: `${brand.urls.docs}/api`, text: 'Betanet API →', external: true },
            ]}
            cta={{ href: brand.urls.docs, text: 'Read the docs', external: true }}
            art={<div className="w-full h-[210px] md:h-[250px]"><BuildIdle /></div>}
          />
          <Panel
            id="gpu-owners"
            eyebrow="FOR GPU OWNERS"
            title="Plug in, get paid"
            body="Your idle hardware earns USDC for real work: from a browser tab today, a full node when the betanet opens. Leave whenever you want."
            links={[
              { href: '/earn', text: 'Earn in your browser →' },
              { href: brand.urls.docs, text: 'Run a full node →', external: true },
            ]}
            cta={{ href: '/earn', text: 'Start earning' }}
            art={<div className="w-full h-[200px] md:h-[240px]"><CoinsIdle /></div>}
            flip
          />
          <Panel
            id="community"
            eyebrow="FOR THE OPEN-MODEL COMMUNITY"
            title={<>Own a piece</>}
            body={<>Open models need open infrastructure to run on. Network revenue funds the treasury: half burns <span className="dollar">$</span>ZERO, half pays the people who stake it.</>}
            links={[
              { href: '/treasury', text: 'Treasury →' },
              { href: brand.urls.data, text: 'Network data →', external: true },
            ]}
            cta={{ href: '/staking', text: <>Explore <span className="dollar">$</span>ZERO</> }}
            art={<div className="w-full h-[240px] md:h-[280px]"><GlobeMini /></div>}
          />
        </div>
      </div>
    </section>
  );
}
