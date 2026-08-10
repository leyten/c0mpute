'use client';

import { useBrand } from '@/components/BrandProvider';
import { THEME_STORAGE_KEY } from '@/lib/theme';

/**
 * Light/dark switch for Compute Network.
 *
 * Renders nothing at all on c0mpute.ai. That domain is permanently dark: no
 * control, no storage read, no way for a visitor to put it into a state its
 * 20 live workers have never been looked at in.
 *
 * There is no React state here, and that is the whole design. The obvious
 * build — read the theme in an effect, keep it in useState, pick an icon —
 * cannot render the right icon on the server, because the server does not
 * know about the stored override. It would paint the default icon, hydrate,
 * and swap. Instead both icons are always in the DOM and the `light:`/`dark:`
 * variants (which key off the same data-theme attribute the palette does)
 * show exactly one. First paint is correct even when the no-flash script has
 * just overridden the server's choice, and there is nothing to hydrate.
 *
 * The current theme is therefore read off the DOM at click time rather than
 * tracked — the DOM is already the single source of truth.
 */
export default function ThemeToggle({
  className = '',
  withLabel = false,
}: {
  className?: string;
  /** Mobile menu renders a labelled row rather than a bare icon. */
  withLabel?: boolean;
}) {
  const brand = useBrand();
  if (brand.id !== 'compute') return null;

  const toggle = () => {
    const el = document.documentElement;
    const next = el.dataset.theme === 'dark' ? 'light' : 'dark';
    el.dataset.theme = next;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Private mode / blocked storage. The switch still works for this
      // page view; it just will not be remembered. Not worth surfacing.
    }
    // Ease the swap instead of hard-cutting the whole page. Set only in
    // response to this click, so it can never run on first paint, and the
    // rule itself is inside a prefers-reduced-motion guard.
    el.dataset.themeSwitching = '';
    window.setTimeout(() => {
      delete el.dataset.themeSwitching;
    }, 200);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle colour theme"
      title="Toggle colour theme"
      className={className}
    >
      {/* Shown on light, switches to dark. */}
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
        className="dark:hidden"
      >
        <path d="M21.64 13a1 1 0 0 0-1.05-.14 8.05 8.05 0 0 1-3.37.73 8.15 8.15 0 0 1-8.14-8.1 8.59 8.59 0 0 1 .25-2A1 1 0 0 0 8 2.36a10.14 10.14 0 1 0 14 11.69 1 1 0 0 0-.36-1.05z" />
      </svg>
      {/* Shown on dark, switches to light. */}
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden="true"
        className="light:hidden"
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
      </svg>
      {withLabel && (
        <>
          <span className="dark:hidden">Dark mode</span>
          <span className="light:hidden">Light mode</span>
        </>
      )}
    </button>
  );
}
