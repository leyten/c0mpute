/**
 * Compute Network mark — three unequal nodes joined by tapered links.
 *
 * Node radii are shard sizes; each link's half-width is its node's radius x 0.375,
 * so every edge is a wedge rather than a bar. Scalene on purpose — symmetry turns
 * it into a generic network icon. Inherits colour via currentColor.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} fill="currentColor" aria-hidden="true">
      <path d="M29.93 74.20 L56.62 23.47 L51.38 20.53 L22.07 69.80 Z" />
      <path d="M51.45 23.58 L76.81 65.97 L83.19 62.03 L56.55 20.42 Z" />
      <path d="M79.45 60.29 L25.34 67.55 L26.66 76.45 L80.55 67.71 Z" />
      <circle cx="26" cy="72" r="12" />
      <circle cx="54" cy="22" r="8" />
      <circle cx="80" cy="64" r="10" />
    </svg>
  );
}
