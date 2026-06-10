/* data.c0mpute.ai — pixel chart engine.
   Every chart is drawn from discrete square blocks: bars are stacks of pixels,
   lines are hard stairsteps, fills are Bayer-dither patterns. No curves,
   no gradients, no antialiasing. */

const SHADES = { max: 'rgba(255,255,255,0.95)', pro: 'rgba(255,255,255,0.55)', image: 'rgba(255,255,255,0.28)', other: 'rgba(255,255,255,0.15)' };
const GRID = 'rgba(255,255,255,0.07)';
const TXT = 'rgba(255,255,255,0.45)';
const tooltip = document.getElementById('tooltip');

const fmt = (n) => {
  if (n == null) return '–';
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (Math.abs(n) >= 1e4) return (n / 1e3).toFixed(1) + 'k';
  return Math.round(n).toLocaleString('en-US');
};
const usd = (n) => '$' + (n >= 1000 ? fmt(n) : (Math.round(n * 100) / 100).toLocaleString('en-US'));
const comma = (n) => Math.round(n).toLocaleString('en-US');

function dayRange(from, to) {
  const out = [];
  const d = new Date(from + 'T00:00:00Z');
  const end = new Date(to + 'T00:00:00Z');
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}
const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

/* ---- canvas setup ---- */
function ctx2d(canvas) {
  const r = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(r.width * dpr);
  canvas.height = Math.round(r.height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  return { ctx, W: r.width, H: r.height };
}

const PAD = { l: 44, r: 6, t: 8, b: 20 };

function frame(ctx, W, H, maxV, labels) {
  ctx.clearRect(0, 0, W, H);
  ctx.font = '10px "Courier New", monospace';
  ctx.fillStyle = TXT;
  // y grid: 0, mid, max
  for (const f of [0, 0.5, 1]) {
    const y = Math.round(PAD.t + (1 - f) * (H - PAD.t - PAD.b)) + 0.5;
    ctx.strokeStyle = GRID;
    ctx.beginPath();
    ctx.moveTo(PAD.l, y);
    ctx.lineTo(W - PAD.r, y);
    ctx.stroke();
    ctx.fillText(fmt(maxV * f), 4, y + 3);
  }
  // x labels: ~5 spread out
  if (labels && labels.length) {
    const n = Math.min(5, labels.length);
    for (let i = 0; i < n; i++) {
      const idx = Math.round((i / Math.max(n - 1, 1)) * (labels.length - 1));
      const x = PAD.l + ((idx + 0.5) / labels.length) * (W - PAD.l - PAD.r);
      const lab = labels[idx].slice(5); // MM-DD
      ctx.fillText(lab, Math.min(x - 14, W - 34), H - 6);
    }
  }
}

/* hover plumbing: each chart registers a column lookup */
function hover(canvas, days, lineFor) {
  canvas.onmousemove = (e) => {
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const i = Math.floor(((x - PAD.l) / (r.width - PAD.l - PAD.r)) * days.length);
    if (i < 0 || i >= days.length) { tooltip.style.display = 'none'; return; }
    tooltip.textContent = lineFor(i);
    tooltip.style.display = 'block';
    tooltip.style.left = Math.min(e.clientX + 12, window.innerWidth - 180) + 'px';
    tooltip.style.top = e.clientY + 14 + 'px';
  };
  canvas.onmouseleave = () => (tooltip.style.display = 'none');
}

/* stacked pixel-block bars. series = [{key, values}] aligned to days */
function pixelBars(canvas, days, series) {
  const { ctx, W, H } = ctx2d(canvas);
  const totals = days.map((_, i) => series.reduce((s, sr) => s + (sr.values[i] || 0), 0));
  const maxV = Math.max(...totals, 1);
  frame(ctx, W, H, maxV, days);
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const colW = plotW / days.length;
  const bw = Math.max(2, Math.floor(colW * 0.62)); // bar width
  const block = Math.max(2, Math.min(6, Math.floor(bw / 2))); // pixel block size
  for (let i = 0; i < days.length; i++) {
    const x = Math.round(PAD.l + i * colW + (colW - bw) / 2);
    let yCursor = PAD.t + plotH;
    for (const sr of series) {
      const v = sr.values[i] || 0;
      if (!v) continue;
      const hpx = (v / maxV) * plotH;
      const nBlocks = Math.max(1, Math.round(hpx / (block + 1)));
      ctx.fillStyle = SHADES[sr.key] || SHADES.other;
      for (let b = 0; b < nBlocks; b++) {
        yCursor -= block + 1;
        ctx.fillRect(x, Math.round(yCursor), bw, block);
      }
    }
  }
  hover(canvas, days, (i) =>
    `${days[i]}\n` + series.map((s) => `${s.key}: ${comma(s.values[i] || 0)}`).join('\n') + (series.length > 1 ? `\ntotal: ${comma(totals[i])}` : '')
  );
}

/* 4x4 Bayer matrix dither fill under a stepped line */
const BAYER = [ [0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5] ];

function stepLine(canvas, days, values, { dither = true, fmtV = comma } = {}) {
  const { ctx, W, H } = ctx2d(canvas);
  const maxV = Math.max(...values, 1);
  frame(ctx, W, H, maxV, days);
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const colW = plotW / days.length;
  const yOf = (v) => PAD.t + (1 - v / maxV) * plotH;

  if (dither) {
    const cell = 3;
    for (let i = 0; i < days.length; i++) {
      const yTop = yOf(values[i]);
      const x0 = PAD.l + i * colW;
      const frac = 0.35 * (values[i] / maxV) + 0.08;
      for (let y = Math.ceil(yTop / cell) * cell; y < PAD.t + plotH; y += cell) {
        for (let x = Math.floor(x0 / cell) * cell; x < x0 + colW && x < W - PAD.r; x += cell) {
          const t = BAYER[(y / cell) % 4 | 0][(x / cell) % 4 | 0] / 16;
          if (t < frac) {
            ctx.fillStyle = 'rgba(255,255,255,0.35)';
            ctx.fillRect(x, y, cell - 1, cell - 1);
          }
        }
      }
    }
  }
  // hard stairstep line, 2px
  ctx.fillStyle = '#fff';
  for (let i = 0; i < days.length; i++) {
    const x0 = Math.round(PAD.l + i * colW);
    const y = Math.round(yOf(values[i]));
    ctx.fillRect(x0, y - 1, Math.ceil(colW) + 1, 2);
    if (i > 0) {
      const yPrev = Math.round(yOf(values[i - 1]));
      ctx.fillRect(x0 - 1, Math.min(y, yPrev), 2, Math.abs(y - yPrev) + 1);
    }
  }
  hover(canvas, days, (i) => `${days[i]}\n${fmtV(values[i])}`);
}

/* ---- data shaping ---- */
function seriesByDay(rows, days, key, val) {
  const m = {};
  for (const r of rows) m[r.day + '|' + (key ? r[key] : '')] = (m[r.day + '|' + (key ? r[key] : '')] || 0) + (r[val] || 0);
  return (k) => days.map((d) => m[d + '|' + (k || '')] || 0);
}
function cumulative(days, daily) {
  let s = 0;
  return daily.map((v) => (s += v));
}
function card(v, k, live) {
  return `<div class="card"><div class="v">${v}</div><div class="k">${live ? '<span class="dot"></span>' : ''}${k}</div></div>`;
}

/* ---- hero pixels (canvas take on the homepage PixelBlast) ---- */
function heroPixels() {
  const c = document.getElementById('hero-pixels');
  const { ctx, W, H } = ctx2d(c);
  const px = 5, gap = 9;
  const cols = Math.ceil(W / gap), rows = Math.ceil(H / gap);
  const cells = [];
  for (let i = 0; i < 110; i++) cells.push({ x: (Math.random() * cols) | 0, y: (Math.random() * rows) | 0, p: Math.random() * Math.PI * 2, s: 0.4 + Math.random() });
  (function tick(t) {
    ctx.clearRect(0, 0, W, H);
    for (const cl of cells) {
      const a = 0.04 + 0.13 * (0.5 + 0.5 * Math.sin(cl.p + t * 0.0006 * cl.s));
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.fillRect(cl.x * gap, cl.y * gap, px, px);
    }
    requestAnimationFrame(tick);
  })(0);
}

/* ---- render ---- */
let DATA = null;

function render() {
  const d = DATA;
  if (!d) return;
  const charts = {};
  document.querySelectorAll('canvas[data-chart]').forEach((c) => (charts[c.dataset.chart] = c));

  // hero
  document.getElementById('hero-tokens').textContent = comma(d.network.totals.tokens || 0);

  // live cards
  const lv = d.live || { workersOnline: 0, byType: { native: 0, browser: 0, image: 0 }, busy: 0, queueDepth: 0 };
  const mk = d.zero.market;
  document.getElementById('live-cards').innerHTML = [
    card(lv.workersOnline, 'workers online', true),
    card(lv.byType.native, 'max (native gpu)', true),
    card(lv.byType.browser, 'pro (browser)', true),
    card(lv.byType.image, 'image', true),
    card(lv.busy + '<small>/' + lv.workersOnline + '</small>', 'busy now'),
    card(mk ? '$' + (mk.priceUsd != null ? mk.priceUsd.toFixed(7) : '–') : '–', '$ZERO price'),
    card(mk ? usd(mk.mcapUsd) : '–', 'market cap'),
    card(mk ? usd(mk.liquidityUsd) : '–', 'liquidity'),
  ].join('');

  // ---- network ----
  const days30 = dayRange(daysAgo(29), today());
  const jb = seriesByDay(d.network.jobsDaily, days30, 'tier', 'jobs');
  pixelBars(charts.jobs, days30, [
    { key: 'max', values: jb('max') },
    { key: 'pro', values: jb('pro') },
    { key: 'image', values: jb('image') },
  ]);
  const tk = seriesByDay(d.network.jobsDaily, days30, null, 'tokens');
  stepLine(charts.tokens, days30, tk(null), { fmtV: (v) => comma(v) + ' tokens' });
  const sp = {};
  for (const r of d.network.speedDaily) sp[r.day] = r.tokPerSec;
  stepLine(charts.speed, days30, days30.map((dd) => sp[dd] || 0), { dither: false, fmtV: (v) => v + ' tok/s' });

  // workers online history (5-min samples)
  const wh = d.workerHistory || [];
  if (wh.length > 1) {
    const labels = wh.map((r) => r.at.slice(5, 16).replace('T', ' '));
    stepLine(charts.workers, labels, wh.map((r) => r.total), { dither: false, fmtV: (v) => v + ' workers' });
  } else {
    const { ctx, W, H } = ctx2d(charts.workers);
    ctx.font = '12px "Courier New", monospace';
    ctx.fillStyle = TXT;
    ctx.fillText('recording started 2026-06-10 — history fills in from today', 20, H / 2);
  }

  // ---- users ----
  const u = d.users;
  document.getElementById('user-cards').innerHTML = [
    card(comma(u.total), 'registered users'),
    card(comma(u.freePrompts.used), 'free prompts used'),
    card(comma(u.freeImages.used), 'free images used'),
    card(comma(u.apiKeys), 'active api keys'),
  ].join('');
  const allDays = dayRange(u.signupsDaily[0]?.day || daysAgo(29), today());
  const su = seriesByDay(u.signupsDaily, days30, null, 'users');
  pixelBars(charts.signups, days30, [{ key: 'max', values: su(null) }]);
  const suAll = seriesByDay(u.signupsDaily, allDays, null, 'users');
  stepLine(charts.cumusers, allDays, cumulative(allDays, suAll(null)), { fmtV: (v) => comma(v) + ' users' });
  const an = seriesByDay(u.anonDaily, days30, null, 'visitors');
  pixelBars(charts.anon, days30, [{ key: 'pro', values: an(null) }]);

  // ---- revenue ----
  const rv = d.revenue;
  const depositTotal = rv.depositEvents.reduce((s, e) => s + e.amount, 0) / 100;
  const payoutTotal = rv.payoutEvents.reduce((s, e) => s + e.usd, 0);
  const spendTotal = rv.spendDaily.reduce((s, e) => s + e.credits, 0) / 100;
  document.getElementById('revenue-cards').innerHTML = [
    card(usd(depositTotal), 'USDC deposited (lifetime)'),
    card(usd(spendTotal), 'credits spent (lifetime)'),
    card(usd(payoutTotal), 'paid out to workers'),
  ].join('');
  const spd = seriesByDay(rv.spendDaily, days30, 'tier', 'credits');
  pixelBars(charts.spend, days30, [
    { key: 'max', values: spd('max') },
    { key: 'pro', values: spd('pro') },
    { key: 'image', values: spd('image') },
  ]);
  const depDays = dayRange(rv.depositEvents[0]?.day || daysAgo(29), today());
  const dep = seriesByDay(rv.depositEvents, depDays, null, 'amount');
  stepLine(charts.deposits, depDays, cumulative(depDays, dep(null)).map((v) => v / 100), { fmtV: usd });
  const payDays = dayRange(rv.payoutEvents[0]?.day || daysAgo(29), today());
  const pay = seriesByDay(rv.payoutEvents, payDays, null, 'usd');
  stepLine(charts.payouts, payDays, cumulative(payDays, pay(null)), { fmtV: usd });

  // ---- $ZERO ----
  const z = d.zero;
  const t = z.treasury || {};
  document.getElementById('zero-cards').innerHTML = [
    card(fmt(t.totalZeroBurned), 'ZERO burned'),
    card(usd(t.totalBuybackUsd || 0), 'buyback spent'),
    card(usd(t.totalStakerRewardsUsd || 0), 'staker rewards paid'),
    card(fmt(t.totalZeroStaked), 'ZERO staked'),
    card(usd((t.pendingBuyback || 0) + (t.pendingStakerRewards || 0)), 'pending next cycle'),
  ].join('');
  const burnDays = dayRange(z.burnEvents[0]?.day || daysAgo(29), today());
  const bz = seriesByDay(z.burnEvents, burnDays, null, 'zero');
  pixelBars(charts.burns, burnDays, [{ key: 'max', values: bz(null) }]);
  const bu = seriesByDay(z.burnEvents, burnDays, null, 'usd');
  stepLine(charts.buyback, burnDays, cumulative(burnDays, bu(null)), { fmtV: usd });
  const srDays = dayRange(z.stakerPayoutEvents[0]?.day || daysAgo(29), today());
  const sr = seriesByDay(z.stakerPayoutEvents, srDays, null, 'usd');
  stepLine(charts.rewards, srDays, cumulative(srDays, sr(null)), { fmtV: usd });

  // burn log
  document.getElementById('burn-list').innerHTML = z.burnEvents
    .slice(-6)
    .reverse()
    .map(
      (b) =>
        `<div class="row"><span class="amt">${comma(b.zero || 0)} ZERO</span><span class="usd">${usd(b.usd)}</span><span class="date">${b.day}</span>` +
        (b.tx ? `<a href="https://solscan.io/tx/${b.tx}" target="_blank" rel="noopener">tx ↗</a>` : '') +
        `</div>`
    )
    .join('');

  // footer
  const age = Math.max(0, Math.round((Date.now() - new Date(d.generatedAt).getTime()) / 1000));
  document.getElementById('updated').textContent = `data generated ${age < 120 ? age + 's' : Math.round(age / 60) + 'min'} ago — refreshes every 5 min`;
}

async function load() {
  try {
    const r = await fetch('stats.json', { cache: 'no-store' });
    DATA = await r.json();
    render();
  } catch (e) {
    console.error(e);
  }
}

heroPixels();
load();
setInterval(load, 60_000);
let rz;
window.addEventListener('resize', () => {
  clearTimeout(rz);
  rz = setTimeout(render, 200);
});
