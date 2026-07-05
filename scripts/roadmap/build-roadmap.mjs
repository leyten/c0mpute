#!/usr/bin/env node
// Generates public/roadmap-clone/index.html from roadmap-data.json.
// The SVG keeps the structural contract of the Mina roadmap engine
// (css/main.min.css + js/main.min.js), which the page reuses unchanged:
//   #roadmap-rows > g            = one group per track row (hover dims others)
//   row > g:last-child > g       = one group per item
//   item > g:first-child         = the visible box
//   item > g:last-child > g      = the hover tooltip (CSS-animated)
//   any element with id^="http"  = clickable link
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(here, 'roadmap-data.json'), 'utf8'));
const OUT = join(here, '..', '..', 'public', 'roadmap-clone', 'index.html');

// ── Geometry ────────────────────────────────────────────────────────────────
const W = 3460;
const LABEL_X = 60, LABEL_W = 520;
const CHART_X = LABEL_X + LABEL_W + 40; // 620
const CHART_W = W - 60 - CHART_X;
// The shipped column is double-width: shipped stacks got tall, so items lay
// out in a 2-wide grid there while the future columns stay single stacks.
const PHASE_UNITS = { shipped: 2 };
const totalUnits = data.phases.reduce((a, p) => a + (PHASE_UNITS[p] || 1), 0);
const UNIT_W = CHART_W / totalUnits;
const colX = {}, colW = {};
{
  let cx = CHART_X;
  for (const p of data.phases) { colX[p] = cx; colW[p] = UNIT_W * (PHASE_UNITS[p] || 1); cx += colW[p]; }
}
// grid columns used inside a phase cell (2-wide only when the stack is tall)
const gridCols = (phase, n) => ((PHASE_UNITS[phase] || 1) > 1 && n > 3 ? PHASE_UNITS[phase] : 1);
const HEAD_Y = 300, HEAD_H = 46;
const ROWS_Y = HEAD_Y + HEAD_H + 4;
const ITEM_W = 400, ITEM_H = 78, ITEM_GAP = 36;
const ROW_PAD = 70;

const FONT_MONO = `'Courier New', Monaco, Consolas, monospace`;
const FONT_PIXEL = `'argent-pixel-cf', sans-serif`;

const GREEN = '#22c55e';
const BLUE = '#80a0c1';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function wrap(text, maxChars) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    if (line && (line + ' ' + w).length > maxChars) { lines.push(line); line = w; }
    else line = line ? line + ' ' + w : w;
  }
  if (line) lines.push(line);
  return lines;
}

function textBlock(x, y, lines, { size = 20, fill = '#fff', family = FONT_MONO, lh = 1.4, anchor = 'start', weight = 'normal', spacing = '0' } = {}) {
  const tspans = lines.map((l, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : size * lh}">${esc(l)}</tspan>`).join('');
  return `<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" fill="${fill}" text-anchor="${anchor}" font-weight="${weight}" letter-spacing="${spacing}">${tspans}</text>`;
}

// c0mpute wordmark: exact copy of the site header treatment — the zero is the
// same argent-pixel font at 1.8x on the shared baseline (app/page.tsx:139).
function wordmark(x, y, size) {
  return `<text x="${x}" y="${y}" font-family="${FONT_PIXEL}" font-size="${size}" fill="#fff">C<tspan font-size="${size * 1.8}">0</tspan><tspan font-size="${size}">MPUTE</tspan></text>`;
}

// Pixel-serif titles: "$" renders in mono (argent's $ glyph is off-brand) and
// "0" renders oversized at 1.8x like the site header wordmark.
function pixelTitle(x, y, size, name, fill = '#fff') {
  let body = '';
  for (const ch of name) {
    if (ch === '$') body += `<tspan font-family="${FONT_MONO}">$</tspan>`;
    else if (ch === '0') body += `<tspan font-size="${size * 1.8}">0</tspan>`;
    else body += esc(ch);
  }
  return `<text x="${x}" y="${y}" font-family="${FONT_PIXEL}" font-size="${size}" fill="${fill}">${body}</text>`;
}

// ── Layout items ────────────────────────────────────────────────────────────
const pos = {}; // id -> {x, y}
const trackHeights = [];
for (const track of data.tracks) {
  const byPhase = Object.fromEntries(data.phases.map((p) => [p, track.items.filter((i) => i.phase === p)]));
  const maxStack = Math.max(...data.phases.map((p) => Math.ceil(byPhase[p].length / gridCols(p, byPhase[p].length))));
  trackHeights.push(Math.max(340, ROW_PAD * 2 + maxStack * ITEM_H + (maxStack - 1) * ITEM_GAP));
}
const H = ROWS_Y + trackHeights.reduce((a, b) => a + b, 0) + 80;

// ── Build rows ──────────────────────────────────────────────────────────────
let rowsSvg = '';
let rowY = ROWS_Y;
data.tracks.forEach((track, ti) => {
  const rowH = trackHeights[ti];
  const byPhase = Object.fromEntries(data.phases.map((p) => [p, track.items.filter((i) => i.phase === p)]));

  // item positions: a stack (or 2-wide grid) per phase column, vertically
  // centered. Items with outgoing links belong in the RIGHT grid cell in the
  // data file, or their connector would cross the neighbouring box.
  for (const phase of data.phases) {
    const stack = byPhase[phase];
    const cols = gridCols(phase, stack.length);
    const rows = Math.ceil(stack.length / cols);
    const cellW = colW[phase] / cols;
    const stackH = rows * ITEM_H + (rows - 1) * ITEM_GAP;
    const startY = rowY + (rowH - stackH) / 2;
    stack.forEach((item, si) => {
      const r = Math.floor(si / cols), c = si % cols;
      pos[item.id] = { x: colX[phase] + c * cellW + (cellW - ITEM_W) / 2, y: startY + r * (ITEM_H + ITEM_GAP) };
    });
  }

  // static row furniture (label cell, separators) — first children of the row group
  let furniture = `<rect x="${LABEL_X}" y="${rowY}" width="${LABEL_W}" height="${rowH}" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="1.5"/>`;
  furniture += pixelTitle(LABEL_X + 40, rowY + 90, 44, track.name);
  furniture += textBlock(LABEL_X + 40, rowY + 140, wrap(track.tagline, 38), { size: 19, fill: 'rgba(255,255,255,0.55)' });
  furniture += `<line x1="${CHART_X}" y1="${rowY}" x2="${W - 60}" y2="${rowY}" stroke="rgba(255,255,255,0.18)" stroke-width="1.5"/>`;
  if (ti === data.tracks.length - 1)
    furniture += `<line x1="${CHART_X}" y1="${rowY + rowH}" x2="${W - 60}" y2="${rowY + rowH}" stroke="rgba(255,255,255,0.18)" stroke-width="1.5"/>`;
  for (let pi = 1; pi < data.phases.length; pi++) {
    const x = colX[data.phases[pi]];
    furniture += `<line x1="${x}" y1="${rowY}" x2="${x}" y2="${rowY + rowH}" stroke="rgba(255,255,255,0.15)" stroke-width="1.5" stroke-dasharray="3 9"/>`;
  }

  // connectors: dotted pixel-dust lines, no arrowheads (left-to-right needs
  // no explaining — leyten). Sources that link out of a 2-wide grid must be
  // RIGHT-cell items or the line crosses the neighbouring card.
  let linksSvg = '';
  for (const [from, to] of track.links || []) {
    const a = pos[from], b = pos[to];
    if (!a || !b) continue;
    const x1 = a.x + ITEM_W, y1 = a.y + ITEM_H / 2;
    const x2 = b.x, y2 = b.y + ITEM_H / 2;
    const dx = Math.max(60, (x2 - x1) / 2);
    linksSvg += `<path d="M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2 - 2} ${y2}" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="2" stroke-dasharray="2 7" stroke-linecap="round"/>`;
  }

  // items (must be the LAST child group of the row group — tooltip CSS contract)
  let itemsSvg = '';
  for (const item of track.items) {
    const { x, y } = pos[item.id];
    let box = `<rect x="${x}" y="${y}" width="${ITEM_W}" height="${ITEM_H}" fill="#000" stroke="rgba(255,255,255,0.3)" stroke-width="1.5"/>`;
    if (item.status === 'shipped')
      box = `<rect x="${x}" y="${y}" width="${ITEM_W}" height="${ITEM_H}" fill="rgba(34,197,94,0.16)" stroke="rgba(34,197,94,0.8)" stroke-width="1.5"/>`;
    if (item.status === 'progress')
      box = `<rect x="${x}" y="${y}" width="${ITEM_W}" height="${ITEM_H}" fill="#000" stroke="rgba(255,255,255,0.4)" stroke-width="1.5"/>` +
        `<rect x="${x}" y="${y}" width="${ITEM_W * 0.45}" height="${ITEM_H}" fill="rgba(34,197,94,0.25)"/>`;
    if (item.status === 'milestone')
      box = `<rect x="${x}" y="${y}" width="${ITEM_W}" height="${ITEM_H}" fill="rgba(128,160,193,0.08)" stroke="${BLUE}" stroke-width="3.5"/>`;
    // status accent bar on the left edge, same signature as the tooltips
    const accent = item.status === 'milestone' ? `${BLUE}" opacity="0.9`
      : item.status === 'planned' ? `#ffffff" opacity="0.22`
      : `${GREEN}" opacity="0.85`;
    box += `<rect x="${x}" y="${y}" width="6" height="${ITEM_H}" fill="${accent}"/>`;

    const titleLines = wrap(item.title, 28);
    const tSize = 21;
    const textY = y + ITEM_H / 2 + tSize * 0.35 - ((titleLines.length - 1) * tSize * 1.3) / 2;
    box += textBlock(x + 20, textY, titleLines, { size: tSize, lh: 1.3 });

    // tooltip above the box. Courier at 19px advances ~11.4px/char, so the
    // card must be wider than the wrap width + both 26px paddings or the
    // text clips past the right edge.
    const tipLines = wrap(item.blurb, 42);
    const TIP_W = 560;
    const tipH = 78 + tipLines.length * 27;
    const tx = Math.min(x, W - 80 - TIP_W);
    const ty = y - tipH - 14;
    const tooltip =
      `<g display="none"><g>` +
      `<rect x="${tx}" y="${ty}" width="${TIP_W}" height="${tipH}" fill="#0a0a0a" stroke="rgba(255,255,255,0.35)" stroke-width="1.5"/>` +
      `<rect x="${tx}" y="${ty}" width="6" height="${tipH}" fill="${item.status === 'milestone' ? BLUE : GREEN}" opacity="${item.status === 'planned' ? 0.25 : 0.8}"/>` +
      textBlock(tx + 26, ty + 42, [item.title], { size: 21, weight: 'bold' }) +
      textBlock(tx + 26, ty + 78, tipLines, { size: 19, fill: 'rgba(255,255,255,0.7)' }) +
      `</g></g>`;

    itemsSvg += `<g><g>${box}</g>${tooltip}</g>`;
  }

  rowsSvg += `<g>${furniture}${linksSvg}<g>${itemsSvg}</g></g>`;
  rowY += rowH;
});

// ── Header band ─────────────────────────────────────────────────────────────
let headSvg = '';
data.phases.forEach((phase) => {
  const x = colX[phase], w = colW[phase];
  const shipped = phase === 'shipped';
  headSvg += `<rect x="${x}" y="${HEAD_Y}" width="${w}" height="${HEAD_H}" fill="${shipped ? 'rgba(34,197,94,0.16)' : 'none'}" stroke="rgba(255,255,255,0.25)" stroke-width="1.5"/>`;
  headSvg += `<text x="${x + w / 2}" y="${HEAD_Y + HEAD_H / 2 + 7}" font-family="${FONT_MONO}" font-size="20" letter-spacing="3" text-anchor="middle" fill="${shipped ? GREEN : 'rgba(255,255,255,0.75)'}">${data.phaseLabels[phase]}</text>`;
});

// ── Top area ────────────────────────────────────────────────────────────────
// Our own header, not Mina's: brand + huge pixel "Roadmap" stacked left, a
// minimal unboxed legend right, and the pan hint as one quiet line.
let topSvg = '';
topSvg += wordmark(LABEL_X + 10, 95, 44);
topSvg += pixelTitle(LABEL_X + 6, 210, 96, 'Roadmap');
topSvg += textBlock(LABEL_X + 12, 250, [data.subtitle], { size: 20, fill: 'rgba(255,255,255,0.6)', spacing: '2' });
// back-to-site link (id^=http → clickable via main.min.js Link handler),
// outlined like the site's buttons instead of Mina's white block
topSvg += `<g id="https://c0mpute.ai/">` +
  `<rect x="${W - 220 - 320}" y="52" width="320" height="44" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="1.5"/>` +
  `<text x="${W - 220 - 160}" y="80" font-family="${FONT_MONO}" font-size="16" text-anchor="middle" fill="#fff" letter-spacing="1">BACK TO C0MPUTE.AI →</text></g>`;
// legend: one unboxed right-aligned row of swatches
const swatches = [
  { label: 'SHIPPED', fill: 'rgba(34,197,94,0.16)', stroke: 'rgba(34,197,94,0.8)', sw: 1.5 },
  { label: 'IN PROGRESS', fill: 'none', stroke: 'rgba(255,255,255,0.4)', sw: 1.5, half: true },
  { label: 'MILESTONE', fill: 'rgba(128,160,193,0.08)', stroke: BLUE, sw: 3 },
  { label: 'PLANNED', fill: 'none', stroke: 'rgba(255,255,255,0.3)', sw: 1.5 },
];
{
  const slotW = [230, 260, 235, 200];
  let sx = W - 220 - slotW.reduce((a, b) => a + b, 0);
  swatches.forEach((s, i) => {
    topSvg += `<rect x="${sx}" y="${140}" width="44" height="24" fill="${s.fill}" stroke="${s.stroke}" stroke-width="${s.sw}"/>`;
    if (s.half) topSvg += `<rect x="${sx}" y="${140}" width="20" height="24" fill="rgba(34,197,94,0.25)"/>`;
    topSvg += textBlock(sx + 56, 157, [s.label], { size: 13, fill: 'rgba(255,255,255,0.6)', spacing: '1' });
    sx += slotW[i];
  });
}
// pan hint, one quiet line under the legend
topSvg += `<text x="${W - 220}" y="205" font-family="${FONT_MONO}" font-size="15" text-anchor="end" fill="rgba(255,255,255,0.4)">drag to pan · scroll to zoom · hover any card for detail</text>`;
// footer: disclaimer left, footnote right
topSvg += `<text x="${LABEL_X}" y="${H - 30}" font-family="${FONT_MONO}" font-size="15" fill="rgba(255,255,255,0.4)">${esc(data.disclaimer)}</text>`;
topSvg += `<text x="${W - 60}" y="${H - 30}" font-family="${FONT_MONO}" font-size="15" text-anchor="end" fill="rgba(255,255,255,0.4)">${esc(data.footnote)}</text>`;

// ── Assemble page ───────────────────────────────────────────────────────────
const svg = `<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${H}" style="enable-background:new 0 0 ${W} ${H};" xml:space="preserve">
<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 1 L 9 5 L 0 9" fill="none" stroke="rgba(255,255,255,0.6)" stroke-width="1.6"/></marker>
<pattern id="pxgrid" width="46" height="46" patternUnits="userSpaceOnUse"><rect x="0" y="0" width="2" height="2" fill="rgba(255,255,255,0.05)"/></pattern></defs>
<rect x="0" y="0" width="${W}" height="${H}" fill="#000"/>
<rect x="0" y="0" width="${W}" height="${H}" fill="url(#pxgrid)"/>
${topSvg}
${headSvg}
<g id="roadmap-rows">${rowsSvg}</g>
</svg>`;

const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="robots" content="noindex, nofollow">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Roadmap — c0mpute</title>
    <link rel="stylesheet" href="https://use.typekit.net/kwe2dpm.css">
    <link rel="stylesheet" href="/roadmap-clone/css/main.min.css">
    <link rel="stylesheet" href="/roadmap-clone/css/c0mpute.css">
</head>
<body>
    <div class="roadmap">
        <div class="roadmap-canvas">
            ${svg}
        </div>

        <div class="roadmap-tools">
            <div class="roadmap-tools-group">
                <button class="roadmap-tool roadmap-tool-zoomin" data-label="Zoom in">
                    <svg viewBox="0 0 12 12"><line x1="6" y1="1" x2="6" y2="11"></line><line x1="1" y1="6" x2="11" y2="6"></line></svg>
                </button>
                <button class="roadmap-tool roadmap-tool-zoomout" data-label="Zoom out">
                    <svg viewBox="0 0 12 12"><line x1="1" y1="6" x2="11" y2="6"></line></svg>
                </button>
            </div>

            <div class="roadmap-tools-group">
                <button class="roadmap-tool roadmap-tool-fullscreen" data-label="Fullscreen">
                    <svg viewBox="0 0 14 14"><polyline points="1,5 1,1 5,1"></polyline><polyline points="9,1 13,1 13,5"></polyline><polyline points="13,9 13,13 9,13"></polyline><polyline points="5,13 1,13 1,9"></polyline></svg>
                </button>
            </div>
        </div>
    </div>

    <script type="text/javascript" src="/roadmap-clone/js/panzoom.min.js"></script>
    <script type="text/javascript" src="/roadmap-clone/js/main.min.js"></script>
</body>
</html>
`;

writeFileSync(OUT, html);
console.log(`wrote ${OUT} (${html.length} bytes, board ${W}x${H})`);
