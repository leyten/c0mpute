// Registration squares straddling a panel's corners — the technical-drawing
// mark. Attaches ONLY to square-cornered hairline panels (no fill of their
// own); rounded cards and ink cards never carry marks. Parent must be
// position:relative.
export default function CornerMarks() {
  return (
    <>
      <span aria-hidden className="corner-mark" style={{ left: '-7px', top: '-7px' }} />
      <span aria-hidden className="corner-mark" style={{ right: '-7px', top: '-7px' }} />
      <span aria-hidden className="corner-mark" style={{ left: '-7px', bottom: '-7px' }} />
      <span aria-hidden className="corner-mark" style={{ right: '-7px', bottom: '-7px' }} />
    </>
  );
}
