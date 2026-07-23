'use client';

// The chat route is a thin dispatcher over three ground-up concept products.
// Each concept is a complete frontend built on useChatEngine; the switcher is
// preview chrome, deleted at pick time.
import { useEffect, useState } from 'react';
import ConceptOne from './concepts/c1';
import ConceptTwo from './concepts/c2';
import ConceptThree from './concepts/c3';

type Concept = '1' | '2' | '3';
const KEY = 'c0mpute_preview_chatconcept';

export default function ChatPage() {
  const [concept, setConcept] = useState<Concept>('1');
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('v');
    const stored = localStorage.getItem(KEY);
    const pick = (v: string | null): v is Concept => v === '1' || v === '2' || v === '3';
    if (pick(fromUrl)) { setConcept(fromUrl); localStorage.setItem(KEY, fromUrl); }
    else if (pick(stored)) setConcept(stored);
  }, []);
  const choose = (v: Concept) => { setConcept(v); localStorage.setItem(KEY, v); };
  return (
    <>
      {concept === '1' ? <ConceptOne /> : concept === '2' ? <ConceptTwo /> : <ConceptThree />}
      <div className="variant-switcher" title="Preview chat concepts">
        {(['1', '2', '3'] as Concept[]).map(v => (
          <button key={v} className={concept === v ? 'on' : ''} onClick={() => choose(v)}>{v}</button>
        ))}
      </div>
    </>
  );
}
