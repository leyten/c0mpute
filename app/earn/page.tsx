'use client';

// Preview-only chrome: the 1-2-3 pill picks the layout. Goes once one is chosen.
import { useEffect, useState, type ComponentType } from 'react';
import Panel from './v1/page';
import Readout from './v2/page';
import ChoiceList from './v3/page';

type Variant = '1' | '2' | '3';

const KEY = 'c0mpute_preview_earnvariant';

const PAGES: Record<Variant, ComponentType> = { '1': Panel, '2': Readout, '3': ChoiceList };
const NAMES: Record<Variant, string> = { '1': 'Panel', '2': 'Readout', '3': 'Choice list' };

export default function EarnPreview() {
  const [variant, setVariant] = useState<Variant>('1');

  useEffect(() => {
    const saved = localStorage.getItem(KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved === '1' || saved === '2' || saved === '3') setVariant(saved);
  }, []);

  const Page = PAGES[variant];

  return (
    <>
      <Page />
      <div className="variant-switcher">
        {(['1', '2', '3'] as const).map(v => (
          <button
            key={v}
            className={variant === v ? 'on' : ''}
            onClick={() => { setVariant(v); localStorage.setItem(KEY, v); }}
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
