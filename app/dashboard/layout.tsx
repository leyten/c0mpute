import { pageMetadata } from '@/lib/seo';

// The page below is a client component and so cannot export metadata itself.
// This layout exists only to carry it; it adds nothing to the markup.
// A signed-in surface has nothing a searcher could want, and left indexable it
// is one more thin page competing with the homepage on brand queries.
export const generateMetadata = () =>
  pageMetadata({ title: 'Dashboard', path: '/dashboard', index: false });

export default function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
