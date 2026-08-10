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
    <main className="min-h-screen bg-black text-white">
      <SiteNav />
      <div className="max-w-3xl mx-auto px-4 md:px-6 pt-32 pb-24">
        <h1 className="pixel-serif text-3xl md:text-4xl mb-2">{title}</h1>
        <p className="pixel-sans text-white/40 text-xs tracking-widest mb-10">
          LAST UPDATED {updated}
        </p>
        <div className="legal-body pixel-sans text-white/70 text-sm leading-relaxed">
          {children}
        </div>
        <p className="pixel-sans text-white/40 text-xs mt-14 pt-6 border-t border-white/10">
          Compute Network Inc. &middot;{' '}
          <a href="/terms" className="hover:text-white transition-colors">Terms</a> &middot;{' '}
          <a href="/privacy" className="hover:text-white transition-colors">Privacy</a> &middot;{' '}
          <a href="/acceptable-use" className="hover:text-white transition-colors">Acceptable Use</a>
        </p>
      </div>
    </main>
  );
}
