import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Roadmap — c0mpute',
  description: 'The c0mpute roadmap: what shipped, what we are building now, and where the network goes next.',
  robots: { index: false, follow: false },
};

export default function RoadmapLayout({ children }: { children: React.ReactNode }) {
  return children;
}
