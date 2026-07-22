// Three audience doors, rebuilt as full-width editorial panels: big serif
// heading + the living card art, alternating sides. Every CTA lands on an
// existing surface.
import OrchestratorFlow from '@/components/OrchestratorFlow';
import EarningsVisual from '@/components/EarningsVisual';
import GlobeMini from './GlobeMini';

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
    <div id={id} className="border border-white/10 bg-white/[0.02] rounded-3xl overflow-hidden hover:bg-white/[0.04] transition-colors">
      <div className={`grid grid-cols-1 md:grid-cols-2 items-stretch`}>
        <div className={`p-7 md:p-12 flex flex-col ${flip ? 'md:order-2' : ''}`}>
          <div className="pixel-sans text-white/40 text-xs tracking-widest mb-4">{eyebrow}</div>
          <h3 className="pixel-serif text-white text-2xl md:text-4xl leading-tight">{title}</h3>
          <p className="pixel-sans text-white/70 text-sm md:text-base mt-4 leading-relaxed max-w-md">{body}</p>
          <div className="mt-6 flex flex-col gap-2.5">
            {links.map((l) => (
              <a key={l.text} href={l.href}
                {...(l.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                className="cursor-pointer pixel-sans text-[#80a0c1]/50 hover:text-[#80a0c1] text-sm transition-colors">
                {l.text}
              </a>
            ))}
          </div>
          <div className="pt-8 mt-auto">
            <a href={cta.href}
              {...(cta.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              className="cursor-pointer pixel-serif-logo text-sm px-5 py-2.5 border border-white/20 rounded-lg text-white hover:bg-white/5 transition-colors inline-block">
              {cta.text}
            </a>
          </div>
        </div>
        <div className={`relative min-h-[220px] md:min-h-[300px] flex items-center justify-center p-6 md:p-10 ${flip ? 'md:order-1 md:border-r' : 'md:border-l'} border-t md:border-t-0 border-white/10`}>
          {art}
        </div>
      </div>
    </div>
  );
}

export default function Doors() {
  return (
    <section id="doors" className="bg-black py-16 md:py-24 border-t border-white/5">
      <div className="max-w-6xl mx-auto px-4 md:px-6">
        <div className="text-center mb-12 md:mb-16">
          <div className="pixel-sans text-white/40 text-xs tracking-widest mb-3">THREE DOORS</div>
          <h2 className="pixel-serif text-white text-3xl md:text-4xl lg:text-5xl">Pick your door</h2>
        </div>
        <div className="flex flex-col gap-6 md:gap-8">
          <Panel
            id="developers"
            eyebrow="FOR DEVELOPERS"
            title="Build on the network"
            body="One API, served by a network instead of a data center — every response backed by the receipts underneath it. The v1 endpoint answers today; the betanet API opens at launch."
            links={[
              { href: '/chat', text: 'Try it live →' },
              { href: 'https://docs.c0mpute.ai/api', text: 'Betanet API — at launch →', external: true },
            ]}
            cta={{ href: 'https://docs.c0mpute.ai', text: 'Read the docs', external: true }}
            art={<div className="w-full max-w-[360px] h-[200px]"><OrchestratorFlow /></div>}
          />
          <Panel
            id="gpu-owners"
            eyebrow="FOR GPU OWNERS"
            title="Plug in, get paid"
            body="Your idle hardware earns USDC for real work — from a browser tab today, a full node when the betanet opens. No lock-in; leave whenever."
            links={[
              { href: '/earn', text: 'Earn in your browser →' },
              { href: 'https://docs.c0mpute.ai', text: 'Run a full node — at launch →', external: true },
            ]}
            cta={{ href: '/earn', text: 'Start earning' }}
            art={<div className="w-full max-w-[300px] h-[180px]"><EarningsVisual /></div>}
            flip
          />
          <Panel
            id="community"
            eyebrow="FOR THE OPEN-MODEL COMMUNITY"
            title={<>Own a piece</>}
            body={<>Open models need open infrastructure to run on. Network revenue funds the treasury — half burns <span className="dollar">$</span>ZERO, half pays the people who stake it.</>}
            links={[
              { href: '/treasury', text: 'Treasury →' },
              { href: 'https://data.c0mpute.ai', text: 'Network data →', external: true },
            ]}
            cta={{ href: '/staking', text: <>Explore <span className="dollar">$</span>ZERO</> }}
            art={<div className="w-full h-[240px] md:h-[280px]"><GlobeMini /></div>}
          />
        </div>
      </div>
    </section>
  );
}
