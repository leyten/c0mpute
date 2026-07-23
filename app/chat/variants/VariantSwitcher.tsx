'use client';

// Preview-only chrome: the floating variant switcher pill (bottom right).
// Reuses the .variant-switcher styles from app/homepage-variants.css, same as
// the homepage picker did. Deleted wholesale once a variant is chosen.

export type ChatVariant = '1' | '2' | '3';

export const CHAT_VARIANT_KEY = 'c0mpute_preview_chatvariant';

export default function VariantSwitcher({
  variant, onChange,
}: {
  variant: ChatVariant;
  onChange: (v: ChatVariant) => void;
}) {
  return (
    <div className="variant-switcher">
      {(['1', '2', '3'] as const).map(v => (
        <button
          key={v}
          className={variant === v ? 'on' : ''}
          onClick={() => onChange(v)}
          aria-label={`Chat layout variant ${v}`}
        >
          {v}
        </button>
      ))}
    </div>
  );
}
