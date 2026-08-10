'use client';

import { useEffect } from 'react';
import { useBrand } from '@/components/BrandProvider';

export default function RefRedirect({ target }: { target: string }) {
  const brand = useBrand();
  useEffect(() => {
    window.location.replace(target);
  }, [target]);
  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <a href={target} className="pixel-sans text-white/70">{`entering ${brand.name}...`}</a>
    </div>
  );
}
