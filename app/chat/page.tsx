'use client';

// Preview dispatcher for the Desk lineage: 1 = the original Desk (baseline),
// 2-4 = iterations on it. Switcher is preview chrome, deleted at pick time.
import { useEffect, useState } from 'react';
import ConceptTwo from './concepts/c2';
import DeskOne from './concepts/d1';
import DeskTwo from './concepts/d2';
import DeskThree from './concepts/d3';

type Pick = '1' | '2' | '3' | '4';
const KEY = 'c0mpute_preview_chatconcept';

export default function ChatPage() {
  const [pick, setPick] = useState<Pick>('1');
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('v');
    const stored = localStorage.getItem(KEY);
    const ok = (v: string | null): v is Pick => v === '1' || v === '2' || v === '3' || v === '4';
    if (ok(fromUrl)) { setPick(fromUrl); localStorage.setItem(KEY, fromUrl); }
    else if (ok(stored)) setPick(stored);
  }, []);
  const choose = (v: Pick) => { setPick(v); localStorage.setItem(KEY, v); };
  return (
    <>
      {pick === '1' ? <ConceptTwo /> : pick === '2' ? <DeskOne /> : pick === '3' ? <DeskTwo /> : <DeskThree />}
      <div className="variant-switcher" title="1 = the desk · 2 = receipts · 3 = workspace · 4 = fast">
        {(['1', '2', '3', '4'] as Pick[]).map(v => (
          <button key={v} className={pick === v ? 'on' : ''} onClick={() => choose(v)}>{v}</button>
        ))}
      </div>
    </>
  );
}
