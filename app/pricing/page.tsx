'use client';

// Pricing. One model, three sizes of daily grant, and the arithmetic written
// out rather than implied — the page exists because "unlimited" is the word
// every centralised assistant uses for a throttle it will not name.
//
// Everything quotable lives in ./plans.ts, which now reads the same specs the
// checkout debits, so a price shown here cannot differ from a price charged.
// The CTAs land on /settings#plans, where the plan is actually bought.
import SiteNav from '@/components/SiteNav';
import { useBrand } from '@/components/BrandProvider';
import { CREDITS_PER_DOLLAR, CREDIT_COST, PLANS, type PricingPlan } from './plans';

const MODEL = 'Qwen3.8 27B Uncensored';

/** Prices are quoted in dollars, so the grouping is en-US wherever the reader
 *  is — and pinning it also keeps the server and client renders identical. */
const group = (n: number) => n.toLocaleString('en-US');

/** The closing strip quotes the free grant, so it reads it rather than repeats it. */
const FREE_PLAN = PLANS.find((p) => p.id === 'free') ?? PLANS[0];

/** The shared plate: same hairline and wash as the doors on the homepage. */
function PlanCard({ plan }: { plan: PricingPlan }) {
  const featured = plan.featured === true;
  return (
    <div
      className={`flex flex-col rounded-3xl border p-7 md:p-8 transition-colors ${
        featured
          ? 'border-fg/25 bg-fg/[0.05]'
          : 'border-fg/10 bg-fg/[0.02] hover:bg-fg/[0.04]'
      }`}
    >
      {/* Fixed height so the badge on one card does not push its price a
          couple of pixels below the other two. */}
      <div className="flex h-[22px] items-center justify-between gap-3">
        <span className="pixel-sans text-fg-40 text-[10px] uppercase tracking-[0.14em]">
          {plan.name}
        </span>
        {featured && (
          <span className="pixel-sans rounded-full border border-fg/15 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.14em] text-fg-45">
            Most picked
          </span>
        )}
      </div>

      <div className="mt-5 flex items-baseline gap-1.5">
        <span className="pixel-serif text-fg text-4xl md:text-5xl tabular-nums">
          <span className="dollar">$</span>{plan.monthly}
        </span>
        <span className="pixel-sans text-fg-45 text-[13px]">
          {plan.monthly === 0 ? 'always' : 'a month'}
        </span>
      </div>

      <p className="pixel-sans text-fg-70 text-sm mt-4">{plan.blurb}</p>

      <div className="mt-6 pt-6 border-t border-fg/[0.08]">
        <div className="pixel-serif text-fg text-xl tabular-nums">
          {group(plan.dailyCredits)} credits a day
        </div>
        <p className="pixel-sans text-fg-45 text-[13px] mt-1.5">{plan.allowance}</p>
      </div>

      <ul className="mt-6 flex flex-col">
        {plan.features.map((feature, i) => (
          <li
            key={feature}
            className={`pixel-sans text-fg-55 text-[13.5px] flex items-start gap-2.5 py-2 ${
              i > 0 ? 'border-t border-fg/[0.06]' : ''
            }`}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 16 16"
              className="mt-[3px] h-3.5 w-3.5 shrink-0 text-fg-35"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 8.5l3.2 3.2L13 5" />
            </svg>
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <div className="pt-8 mt-auto">
        <a
          href={plan.cta.href}
          // The transparent border is load-bearing: without it the filled
          // button is 2px shorter than the outlined ones and the row of CTAs
          // sits at three different heights.
          className={`inline-block rounded-xl border px-5 py-2.5 text-[14.5px] transition-colors ${
            featured
              ? 'border-transparent bg-fg text-on-fg hover:bg-fg/90'
              : 'border-fg/15 text-fg-80 hover:bg-fg/[0.06] hover:text-fg'
          }`}
        >
          {plan.cta.label}
        </a>
      </div>
    </div>
  );
}

/** One rule of the credit system, stated once. */
function Rule({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="pixel-sans text-fg text-sm">{title}</div>
      <p className="pixel-sans text-fg-55 text-[13.5px] leading-relaxed mt-1.5">{children}</p>
    </div>
  );
}

function Question({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="pixel-serif text-fg text-lg md:text-xl leading-snug">{q}</h3>
      <p className="pixel-sans text-fg-55 text-[13.5px] leading-relaxed mt-2.5">{children}</p>
    </div>
  );
}

export default function Pricing() {
  const brand = useBrand();
  const link = 'text-steel-50 light:text-steel hover:text-steel transition-colors';

  return (
    <main className="min-h-screen bg-background text-fg">
      <SiteNav />

      {/* the claim */}
      <section className="max-w-6xl mx-auto px-4 md:px-6 pt-32 md:pt-40 pb-12 md:pb-16">
        <div className="max-w-2xl">
          <div className="pixel-sans text-fg-40 text-xs tracking-widest mb-4">PRICING</div>
          <h1 className="pixel-serif text-fg text-3xl md:text-5xl leading-tight tracking-tight">
            Pay for AI that&rsquo;s private,<br />uncensored and decentralized.
          </h1>
          <p className="pixel-sans text-fg-90 text-sm md:text-lg leading-relaxed mt-6">
            Every plan runs the same model: {MODEL}, with tools, vision and thinking.
            The only difference is how much you use per day.
          </p>
          <p className="pixel-sans text-fg-55 text-sm leading-relaxed mt-4">
            Less than the private-AI subscriptions it replaces, and the network pays its suppliers:
            put a GPU to work and it earns back what a plan costs.{' '}
            <a href="/earn" className={link}>Earn your subscription back &rarr;</a>
          </p>
        </div>
      </section>

      {/* the plans */}
      <section className="max-w-6xl mx-auto px-4 md:px-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6">
          {PLANS.map((plan) => (
            <PlanCard key={plan.id} plan={plan} />
          ))}
        </div>

        {/* The one sentence that keeps the three numbers above honest. */}
        <p className="pixel-sans text-fg-40 text-[13px] leading-relaxed mt-8 max-w-2xl">
          Plans give you generous daily credits, not a vague &ldquo;unlimited&rdquo;. Heavy use
          just spends the day&rsquo;s credits faster.
        </p>
      </section>

      {/* the unit */}
      <section className="border-t border-fg/5 mt-16 md:mt-24">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-16 md:py-20">
          <h2 className="pixel-serif text-fg text-2xl md:text-4xl">How credits work</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-10 gap-y-8 mt-10">
            <Rule title="One credit, one message">
              A typical prompt spends {CREDIT_COST.message}. A long one, or one you ask the model to
              think through, spends a few. An image is {CREDIT_COST.image}.
            </Rule>
            <Rule title="Top-ups are simple">
              <span className="dollar">$</span>1 buys {group(CREDITS_PER_DOLLAR)} credits, no
              subscription needed. Plans get more credits per dollar. That is the point of a plan.
            </Rule>
            <Rule title="Daily credits reset">
              Your plan&rsquo;s grant lands at 00:00 UTC and does not roll over. Yesterday&rsquo;s
              unused credits are gone; today&rsquo;s are already waiting.
            </Rule>
            <Rule title="Bought credits never expire">
              Credits you top up with sit in your balance until you spend them, plan or no plan.
              They are spent only after the day&rsquo;s free grant runs out.
            </Rule>
            <Rule title="Pay as you go">
              Buy credits on their own, with no subscription at all, and spend them at whatever pace
              suits you. <a href="/settings" className={link}>Top up &rarr;</a>
            </Rule>
            <Rule title="Staking grants credits too">
              Staking <span className="dollar">$</span>ZERO earns a daily credit allowance of its
              own, on top of the revenue share.{' '}
              <a href="/staking" className={link}>Staking &rarr;</a>
            </Rule>
          </div>

          {/* Payment. USDC is the live rail; card checkout is a later release
              (owner call 2026-08-21: USDC first, Stripe another day). */}
          <div className="mt-12 md:mt-14 rounded-2xl border border-fg/10 bg-fg/[0.02] px-6 py-5 md:px-8 md:py-6">
            <div className="pixel-sans text-fg text-sm">Pay in USDC</div>
            <p className="pixel-sans text-fg-55 text-[13.5px] leading-relaxed mt-1.5 max-w-2xl">
              Plans and top-ups are paid in USDC on Solana. You send the amount to your own deposit
              address and it settles on-chain: a plan starts when it lands, a top-up goes into your
              balance. There is no card on file and no subscription to cancel. Card payments are
              coming, at the same prices.
            </p>
          </div>
        </div>
      </section>

      {/* the questions */}
      <section className="border-t border-fg/5">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-16 md:py-20">
          <h2 className="pixel-serif text-fg text-2xl md:text-4xl">Questions</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10 mt-10">
            <Question q="What happens when I run out?">
              Nothing breaks. Top up, or wait for tomorrow&rsquo;s grant at 00:00 UTC. Bought
              credits never expire.
            </Question>
            <Question q="Do credits roll over?">
              Daily grants do not; that is what makes them daily. Credits you buy do, and they stay
              in your balance until you spend them.
            </Question>
            <Question q="Is it really uncensored, and really private?">
              Yes to both. We apply no moral filter to your prompts, and the network is built so
              that we largely cannot read them: a request goes to an independent worker that sees
              the job and nothing about you. The few limits that do exist are written down, in{' '}
              <a href="/acceptable-use" className={link}>acceptable use</a> and in the{' '}
              <a href={brand.urls.docs} target="_blank" rel="noopener noreferrer" className={link}>
                docs
              </a>.
            </Question>
            <Question q="Can I earn my subscription back?">
              Run a worker. Your GPU serves the same network you are buying from and is paid in USDC
              for every job it finishes. Keep it online and it covers a plan.{' '}
              <a href="/earn" className={link}>Put a GPU to work &rarr;</a>
            </Question>
          </div>
        </div>
      </section>

      {/* the way in */}
      <section className="border-t border-fg/5">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-14 md:py-16 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <p className="pixel-serif text-fg text-xl md:text-2xl leading-snug max-w-md">
            {group(FREE_PLAN.dailyCredits)} credits a day, no card. Ask it something the others refuse.
          </p>
          <a
            href="/chat"
            className="inline-block self-start rounded-xl bg-fg px-5 py-2.5 text-[14.5px] text-on-fg transition-colors hover:bg-fg/90"
          >
            Start free
          </a>
        </div>
      </section>
    </main>
  );
}
