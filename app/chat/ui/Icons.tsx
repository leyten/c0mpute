// 18px, 1.75 stroke, round caps. Nothing decorative.
const base = {
  width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
};

export const Plus = (p: { className?: string }) => (
  <svg {...base} {...p}><path d="M12 5v14M5 12h14" /></svg>
);
export const Panel = (p: { className?: string }) => (
  <svg {...base} {...p}><rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="M9.5 4v16" /></svg>
);
export const Clip = (p: { className?: string }) => (
  <svg {...base} {...p}><path d="M20 11.5 12.4 19a4.6 4.6 0 0 1-6.5-6.5l7.9-7.9a3 3 0 0 1 4.3 4.3l-7.8 7.8a1.5 1.5 0 0 1-2.1-2.1l7.2-7.2" /></svg>
);
export const Arrow = (p: { className?: string }) => (
  <svg {...base} {...p}><path d="M12 19V5M5 12l7-7 7 7" /></svg>
);
export const Stop = (p: { className?: string }) => (
  <svg {...base} {...p} fill="currentColor" stroke="none"><rect x="7" y="7" width="10" height="10" rx="2" /></svg>
);
export const Chevron = (p: { className?: string }) => (
  <svg {...base} width={14} height={14} {...p}><path d="m6 9 6 6 6-6" /></svg>
);
export const Down = (p: { className?: string }) => (
  <svg {...base} {...p}><path d="M12 5v14M19 12l-7 7-7-7" /></svg>
);
export const Check = (p: { className?: string }) => (
  <svg {...base} width={15} height={15} {...p}><path d="M20 6 9 17l-5-5" /></svg>
);
export const Copy = (p: { className?: string }) => (
  <svg {...base} width={15} height={15} {...p}><rect x="9" y="9" width="11" height="11" rx="2.5" /><path d="M5 15V5.5A1.5 1.5 0 0 1 6.5 4H15" /></svg>
);
export const Trash = (p: { className?: string }) => (
  <svg {...base} width={15} height={15} {...p}><path d="M4 7h16M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M6.5 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7" /></svg>
);
export const Pencil = (p: { className?: string }) => (
  <svg {...base} width={15} height={15} {...p}><path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3Z" /></svg>
);
export const Dots = (p: { className?: string }) => (
  <svg {...base} width={16} height={16} {...p} fill="currentColor" stroke="none"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
);
export const Spark = (p: { className?: string }) => (
  <svg {...base} width={15} height={15} {...p}><path d="M12 3v3M12 18v3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M3 12h3M18 12h3M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" /></svg>
);
export const Image = (p: { className?: string }) => (
  <svg {...base} {...p}><rect x="3" y="4.5" width="18" height="15" rx="2.5" /><circle cx="8.5" cy="10" r="1.5" /><path d="m4 17 4.5-4.5 3 3L15 12l5 5" /></svg>
);
export const X = (p: { className?: string }) => (
  <svg {...base} width={14} height={14} {...p}><path d="M18 6 6 18M6 6l12 12" /></svg>
);
export const Search = (p: { className?: string }) => (
  <svg {...base} {...p}><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>
);
export const Tune = (p: { className?: string }) => (
  <svg {...base} {...p}><path d="M4 8h8M17.4 8H20M4 16h3M12.6 16h7.4" /><circle cx="14.7" cy="8" r="2.3" /><circle cx="9.8" cy="16" r="2.3" /></svg>
);

// ---- answer versions ----
export const Refresh = (p: { className?: string }) => (
  <svg {...base} width={15} height={15} {...p}><path d="M20 12a8 8 0 1 1-2.3-5.6L20 8.5" /><path d="M20 4v4.5h-4.5" /></svg>
);
export const Swap = (p: { className?: string }) => (
  <svg {...base} width={15} height={15} {...p}><path d="M4 9h13l-3.6-3.6" /><path d="M20 15H7l3.6 3.6" /></svg>
);
export const Split = (p: { className?: string }) => (
  <svg {...base} width={15} height={15} {...p}><rect x="3" y="4.5" width="18" height="15" rx="2.5" /><path d="M12 4.5v15" /></svg>
);
export const Left = (p: { className?: string }) => (
  <svg {...base} width={14} height={14} {...p}><path d="m14 6-6 6 6 6" /></svg>
);
export const Right = (p: { className?: string }) => (
  <svg {...base} width={14} height={14} {...p}><path d="m10 6 6 6-6 6" /></svg>
);
