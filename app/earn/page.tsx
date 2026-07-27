'use client';

// Preview-only chrome: pick the Earn layout from the page instead of typing a
// URL. Each variant is a whole page and only the chosen one mounts, so
// switching restarts that variant's demo run from the top — which is wanted,
// since half of what these pages do is boot, download and come alive.
// The whole file goes once a direction is picked.
import { useEffect, useState, type ComponentType } from 'react';
import Instrument from './v1/page';
import Statement from './v2/page';
import Membership from './v3/page';

type Variant = '1' | '2' | '3';

const KEY = 'c0mpute_preview_earnvariant';

const PAGES: Record<Variant, ComponentType> = {
  '1': Instrument,
  '2': Statement,
  '3': Membership,
};

const NAMES: Record<Variant, string> = {
  '1': 'Instrument',
  '2': 'Statement',
  '3': 'Membership',
};

export default function EarnPreview() {
  const [variant, setVariant] = useState<Variant>('1');

  // localStorage is unreadable until mount, so the first paint is always
  // variant 1 and the stored choice arrives a tick later
  useEffect(() => {
    const saved = localStorage.getItem(KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved === '1' || saved === '2' || saved === '3') setVariant(saved);
  }, []);

  const pick = (v: Variant) => {
    setVariant(v);
    localStorage.setItem(KEY, v);
  };

  const Page = PAGES[variant];

  return (
    <>
      <Page />
      <div className="variant-switcher">
        {(['1', '2', '3'] as const).map(v => (
          <button
            key={v}
            className={variant === v ? 'on' : ''}
            onClick={() => pick(v)}
            title={NAMES[v]}
            aria-label={`Earn layout ${v}: ${NAMES[v]}`}
          >
            {v}
          </button>
        ))}
      </div>
    </>
  );
}
