'use client';

import { useEffect } from 'react';

export default function RefRedirect({ target }: { target: string }) {
  useEffect(() => {
    window.location.replace(target);
  }, [target]);
  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <a href={target} className="pixel-sans text-white/70">entering c0mpute...</a>
    </div>
  );
}
