import { pageMetadata } from '@/lib/seo';

// The page below is a client component and so cannot export metadata itself.
// This layout exists only to carry it; it adds nothing to the markup.
// A sign-in form has nothing to rank for and competes with the homepage on
// brand queries if it is left indexable.
export const generateMetadata = () =>
  pageMetadata({ title: 'Sign in', path: '/login', index: false });

export default function LoginLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
