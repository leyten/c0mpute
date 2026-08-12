import { pageMetadata } from '@/lib/seo';

// The page below is a client component and so cannot export metadata itself.
// This layout exists only to carry it; it adds nothing to the markup.
// Signed-in surface: noindex, same reasoning as the dashboard.
export const generateMetadata = () =>
  pageMetadata({ title: 'Settings', path: '/settings', index: false });

export default function SettingsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
