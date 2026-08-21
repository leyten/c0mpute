// Registration squares straddling a panel's corners — the technical-drawing
// mark. Parent must be position:relative. The ink variant is the smaller
// accent square used inside dark cards.
export default function CornerMarks({ onInk = false }: { onInk?: boolean }) {
  const cls = onInk ? 'corner-mark on-ink' : 'corner-mark';
  const off = onInk ? '-4px' : '-7px';
  return (
    <>
      <span aria-hidden className={cls} style={{ left: off, top: off }} />
      <span aria-hidden className={cls} style={{ right: off, top: off }} />
      <span aria-hidden className={cls} style={{ left: off, bottom: off }} />
      <span aria-hidden className={cls} style={{ right: off, bottom: off }} />
    </>
  );
}
