import { pageMetadata } from '@/lib/page-title';

// The page below is a client component and so cannot export metadata itself.
// This layout exists only to title the tab; it adds nothing to the markup.
export const generateMetadata = () => pageMetadata('Create');

export default function CreateLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
