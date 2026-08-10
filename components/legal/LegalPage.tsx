import SiteNav from '@/components/SiteNav';

/**
 * Shared shell for the legal pages (/terms, /privacy, /acceptable-use).
 * Kept deliberately plain — these are read by reviewers and counsel, not browsed.
 */
export default function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-background text-fg">
      <SiteNav />
      <div className="max-w-3xl mx-auto px-4 md:px-6 pt-32 pb-24">
        <h1 className="pixel-serif text-3xl md:text-4xl mb-2">{title}</h1>
        <p className="pixel-sans text-fg-40 text-xs tracking-widest mb-10">
          LAST UPDATED {updated}
        </p>
        <div className="legal-body pixel-sans text-fg-70 text-sm leading-relaxed">
          {children}
        </div>
        <p className="pixel-sans text-fg-40 text-xs mt-14 pt-6 border-t border-fg/10">
          Compute Network Inc. &middot;{' '}
          <a href="/terms" className="hover:text-fg transition-colors">Terms</a> &middot;{' '}
          <a href="/privacy" className="hover:text-fg transition-colors">Privacy</a> &middot;{' '}
          <a href="/acceptable-use" className="hover:text-fg transition-colors">Acceptable Use</a>
        </p>
      </div>
    </main>
  );
}
