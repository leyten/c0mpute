'use client';

// The sticky in-page index for /network, in the homepage's door-index style:
// a number, a word, and an ink underline under the section in view.
import { useEffect, useState } from 'react';

const ITEMS = [
  { id: 'live', n: '01', t: 'Live' },
  { id: 'usage', n: '02', t: 'Usage' },
  { id: 'treasury', n: '03', t: 'Treasury' },
  { id: 'zero', n: '04', t: '$ZERO' },
  { id: 'how', n: '05', t: 'How it works' },
];

export default function NetworkIndex() {
  const [on, setOn] = useState('live');
  useEffect(() => {
    const els = ITEMS.map((i) => document.getElementById(i.id)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver(
      (entries) => { for (const e of entries) if (e.isIntersecting) setOn(e.target.id); },
      { rootMargin: '-45% 0px -50% 0px' },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);
  return (
    <nav className="nw-index" aria-label="On this page">
      <div className="nw-index-in">
        {ITEMS.map((i) => (
          <a key={i.id} href={`#${i.id}`} className={on === i.id ? 'on' : undefined}>
            <span className="n">{i.n}</span><span className="t">{i.t}</span>
          </a>
        ))}
      </div>
    </nav>
  );
}
