'use client';

// Preview dispatcher: three quiet-luxury chat interfaces on the same familiar
// shape, differing in material. 1 = Linen (warm paper), 2 = Steel (machined
// precision), 3 = Glass (depth and motion). Switcher is preview chrome.
import { useEffect, useState } from 'react';
import Linen from './concepts/l1';
import Steel from './concepts/l2';
import Glass from './concepts/l3';

type Pick = '1' | '2' | '3';
const KEY = 'c0mpute_preview_chatconcept';

export default function ChatPage() {
  const [pick, setPick] = useState<Pick>('1');
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('v');
    const stored = localStorage.getItem(KEY);
    const ok = (v: string | null): v is Pick => v === '1' || v === '2' || v === '3';
    if (ok(fromUrl)) { setPick(fromUrl); localStorage.setItem(KEY, fromUrl); }
    else if (ok(stored)) setPick(stored);
  }, []);
  const choose = (v: Pick) => { setPick(v); localStorage.setItem(KEY, v); };
  return (
    <>
      {pick === '1' ? <Linen /> : pick === '2' ? <Steel /> : <Glass />}
      <div className="variant-switcher" title="1 = linen · 2 = steel · 3 = glass">
        {(['1', '2', '3'] as Pick[]).map(v => (
          <button key={v} className={pick === v ? 'on' : ''} onClick={() => choose(v)}>{v}</button>
        ))}
      </div>
    </>
  );
}
