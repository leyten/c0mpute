// Small stroke glyphs for the studio. currentColor throughout, so hover and
// theme states carry through without per-icon colours.

type P = { className?: string; size?: number };
const base = (size = 16) => ({
  width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true,
});

export const IconDownload = ({ className, size }: P) => (
  <svg className={className} {...base(size)}><path d="M8 2v8m0 0L5 7m3 3l3-3M2.5 12.5v1a1 1 0 001 1h9a1 1 0 001-1v-1" /></svg>
);
export const IconX = ({ className, size }: P) => (
  <svg className={className} {...base(size)}><path d="M3.5 3.5l9 9m0-9l-9 9" /></svg>
);
export const IconCopy = ({ className, size }: P) => (
  <svg className={className} {...base(size)}><rect x="5.5" y="5.5" width="8" height="8" /><path d="M10.5 5.5v-3h-8v8h3" /></svg>
);
export const IconPlay = ({ className, size }: P) => (
  <svg className={className} {...base(size)} fill="currentColor" stroke="none"><path d="M4.5 2.8v10.4L13 8z" /></svg>
);
export const IconPause = ({ className, size }: P) => (
  <svg className={className} {...base(size)} fill="currentColor" stroke="none"><path d="M4 2.5h2.8v11H4zM9.2 2.5H12v11H9.2z" /></svg>
);
export const IconVolume = ({ className, size }: P) => (
  <svg className={className} {...base(size)}><path d="M2.5 6h2.5l3.5-3v10L5 10H2.5zM11 5.5a3.5 3.5 0 010 5M12.8 3.5a6.3 6.3 0 010 9" /></svg>
);
export const IconMuted = ({ className, size }: P) => (
  <svg className={className} {...base(size)}><path d="M2.5 6h2.5l3.5-3v10L5 10H2.5zM11 6l3.5 4m0-4L11 10" /></svg>
);
export const IconLoop = ({ className, size }: P) => (
  <svg className={className} {...base(size)}><path d="M3 7V6a2 2 0 012-2h7.5M10.5 2l2 2-2 2M13 9v1a2 2 0 01-2 2H3.5M5.5 14l-2-2 2-2" /></svg>
);
export const IconExpand = ({ className, size }: P) => (
  <svg className={className} {...base(size)}><path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" /></svg>
);
export const IconChevron = ({ className, size, dir = 'down' }: P & { dir?: 'down' | 'up' | 'left' | 'right' }) => {
  const r = { down: 0, up: 180, left: 90, right: -90 }[dir];
  return <svg className={className} {...base(size)} style={{ transform: `rotate(${r}deg)` }}><path d="M4 6l4 4 4-4" /></svg>;
};
export const IconDice = ({ className, size }: P) => (
  <svg className={className} {...base(size)}><rect x="2.5" y="2.5" width="11" height="11" /><circle cx="5.5" cy="5.5" r=".6" fill="currentColor" /><circle cx="10.5" cy="10.5" r=".6" fill="currentColor" /><circle cx="8" cy="8" r=".6" fill="currentColor" /></svg>
);
export const IconRedo = ({ className, size }: P) => (
  <svg className={className} {...base(size)}><path d="M13 3v3.5H9.5M12.6 6.4A5 5 0 103 8" /></svg>
);
export const IconEdit = ({ className, size }: P) => (
  <svg className={className} {...base(size)}><path d="M10.5 2.5l3 3-8 8h-3v-3zM9 4l3 3" /></svg>
);
export const IconTrash = ({ className, size }: P) => (
  <svg className={className} {...base(size)}><path d="M2.5 4.5h11M6 4.5V2.5h4v2M4 4.5l.7 9h6.6l.7-9" /></svg>
);
export const IconBell = ({ className, size }: P) => (
  <svg className={className} {...base(size)}><path d="M4 11V7a4 4 0 018 0v4l1.5 1.5h-11zM6.5 14h3" /></svg>
);
export const IconSpark = ({ className, size }: P) => (
  <svg className={className} {...base(size)}><path d="M8 1.5v4M8 10.5v4M1.5 8h4M10.5 8h4" /></svg>
);
