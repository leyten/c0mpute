import { pageMetadata } from '@/lib/seo';

// The page below is a client component and so cannot export metadata itself.
// This layout exists only to carry it; it adds nothing to the markup.
export const generateMetadata = () =>
  pageMetadata({
    title: 'Studio',
    description:
      'Generate short videos with open models running across a network of user-owned GPUs, not a datacenter. Prompts are not stored and the clips are yours.',
    path: '/studio',
  });

export default function StudioLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
