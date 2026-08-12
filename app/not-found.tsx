import type { Metadata } from 'next';

// Without this file Next serves its own unstyled default, which arrives with a
// second <title> of its own alongside the layout's — two title tags in one
// document, and nothing linking back into the site. A 404 is a page a crawler
// reaches often; it should still offer it somewhere to go.
// No `robots` here: Next already emits its own noindex on a not-found render,
// and a second one would just be a duplicate tag saying the same thing.
export const metadata: Metadata = {
  title: 'Page not found',
};

const LINKS = [
  { href: '/', text: 'Home' },
  { href: '/chat', text: 'Chat' },
  { href: '/earn', text: 'Earn' },
  { href: '/staking', text: 'Staking' },
];

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <p className="pixel-sans text-fg-40 text-xs tracking-widest">404</p>
      <h1 className="pixel-serif text-fg mt-4 text-3xl leading-tight md:text-4xl">
        There is nothing at this address.
      </h1>
      <p className="pixel-sans text-fg-60 mt-4 max-w-md text-sm">
        The page may have moved, or the link may have been mistyped.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-5">
        {LINKS.map((l) => (
          <a
            key={l.href}
            href={l.href}
            className="pixel-sans text-steel-50 light:text-steel hover:text-steel text-sm transition-colors"
          >
            {l.text}
          </a>
        ))}
      </div>
    </main>
  );
}
