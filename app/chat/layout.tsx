import { pageMetadata } from '@/lib/seo';

// The page below is a client component and so cannot export metadata itself.
// This layout exists only to carry it; it adds nothing to the markup.
export const generateMetadata = () =>
  pageMetadata({
    title: 'Chat',
    description:
      'Chat with open models running across a network of user-owned GPUs. Prompts are not stored, no account is needed to start, and the models engage instead of refusing.',
    path: '/chat',
  });

export default function ChatLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
