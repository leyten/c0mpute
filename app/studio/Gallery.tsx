'use client';

import { useEffect, useRef, useState } from 'react';
import { downloadName, type ShownVideo } from './lib';
import { IconDownload, IconTrash } from './icons';

// Finished clips, newest first, in justified rows (see .st-rows) so each keeps
// its true shape. Hovering a tile plays it muted; only one plays at a time.
export function Gallery({ clips, playingId, onPlay, onOpen, onDelete }: {
  clips: ShownVideo[];
  playingId: string | null;
  onPlay: (id: string | null) => void;
  onOpen: (index: number) => void;
  onDelete: (c: ShownVideo) => void;
}) {
  return (
    <div className="st-rows">
      {clips.map((c, i) => (
        <Tile key={c.id} clip={c} playing={playingId === c.id} onPlay={onPlay} onOpen={() => onOpen(i)} onDelete={() => onDelete(c)} />
      ))}
    </div>
  );
}

function Tile({ clip, playing, onPlay, onOpen, onDelete }: {
  clip: ShownVideo;
  playing: boolean;
  onPlay: (id: string | null) => void;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  // Clips live only in this browser, so delete takes a second click on the
  // same button; leaving the tile disarms it.
  const [armed, setArmed] = useState(false);
  const ar = clip.width / clip.height;

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (playing) v.play().catch(() => {});
    else { v.pause(); v.currentTime = 0.1; }
  }, [playing]);

  return (
    <div style={{ flex: `${ar} 1 calc(${ar} * var(--st-row))` }} className="min-w-0">
      <div
        role="button"
        tabIndex={0}
        aria-label={`Open clip: ${clip.prompt}`}
        onClick={onOpen}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
        onMouseEnter={() => onPlay(clip.id)}
        onMouseLeave={() => { onPlay(null); setArmed(false); }}
        style={{ aspectRatio: `${clip.width} / ${clip.height}` }}
        className="group relative cursor-pointer overflow-hidden bg-fg/[0.06] outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-fg"
      >
        {/* #t=0.1 makes browsers paint a first frame as the still */}
        <video ref={ref} src={`${clip.url}#t=0.1`} muted loop playsInline preload="metadata"
          className="absolute inset-0 h-full w-full object-cover" />
        {clip.adult && (
          <span className="pixel-sans absolute left-2 top-2 bg-black/60 px-1.5 text-[10px] leading-[18px] text-white">18+</span>
        )}
        {/* the veil sits on a generated clip, which has no theme, so it stays dark in both */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent px-3 pb-2.5 pt-10 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
          <p className="pixel-sans line-clamp-2 text-[12px] leading-snug text-white/90">{clip.prompt}</p>
        </div>
        <div className={`absolute right-2 top-2 flex gap-1 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 ${armed ? 'opacity-100' : 'opacity-0'}`}>
          <a href={clip.url} download={downloadName(clip)} onClick={(e) => e.stopPropagation()}
            aria-label="Download clip"
            className="grid h-8 w-8 place-items-center bg-black/55 text-white/85 hover:bg-black/80 hover:text-white">
            <IconDownload size={14} />
          </a>
          <button type="button"
            onClick={(e) => { e.stopPropagation(); if (armed) onDelete(); else setArmed(true); }}
            onKeyDown={(e) => e.stopPropagation()}
            onBlur={() => setArmed(false)}
            aria-label={armed ? 'Click again to delete this clip' : 'Delete clip'}
            className={armed
              ? 'pixel-sans flex h-8 cursor-pointer items-center gap-1.5 bg-[#b42318] px-2.5 text-[12px] text-white'
              : 'grid h-8 w-8 cursor-pointer place-items-center bg-black/55 text-white/85 hover:bg-black/80 hover:text-white'}>
            <IconTrash size={14} />{armed && 'Delete?'}
          </button>
        </div>
      </div>
    </div>
  );
}
