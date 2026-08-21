'use client';

// Entrance-reveal trigger: adds .in when the block crosses the viewport, once.
// The animation itself lives in CSS (.rv / .rv-word in globals.css), so
// reduced-motion is handled there and this stays a bare observer.
import { useEffect, useRef } from 'react';

export default function Reveal({
  className = '',
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          el.classList.add('in');
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -60px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
