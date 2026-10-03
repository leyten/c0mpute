/* Compute Network, direction A: "The Tower".
   Bruegel's Tower of Babel, dithered live in one WebGL2 fragment shader:
   - 1-bit ordered dither (Bayer 8x8), cells are whole device pixels (2 CSS px), never a rescaled bitmap
   - the cell grid is anchored to the painting, so pans move the pattern with the picture (no shimmer)
   - scrolling descends the tower from the crown to the ground, which dithers down into the night footer
   - a lens shaped like the triad mark looks through the dither at the painting itself, in colour (it fades
     out while the pointer is off the tower, e.g. over the footer, and returns where the pointer comes back)
   - copy sits in clearings: the dither thins out around it along the same Bayer order
   Frames are only drawn while something changes (scroll, lens easing, the first build). */
(() => {
  'use strict';
  const root = document.documentElement;
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const PAINT = { src: '/home/img/tower-ink.jpg?v=1791044563', color: '/home/img/tower-color.jpg?v=1791044563', colorDark: '/home/img/tower-color-dark.jpg?v=1791044563', scale: 0.75, w: 3840, h: 2810 };   // must match prep.py
  const RAMP = [2540, 2800];   // painting y: the ground dithers down into night between these

  // camera keys: [progress, paintX, paintY, anchorX, anchorY, viewH]
  // = "put painting point (paintX, paintY) at viewport fraction (anchorX, anchorY), showing viewH painting px"
  const KF = {
    wide: [
      [0.000, 1935, 30, 0.50, 0.43, 1750],     // the crown under open sky
      [0.030, 1935, 30, 0.50, 0.43, 1750],
      [0.165, 2670, 540, 0.40, 0.53, 1080],    // 01 developers: the upper tiers (keys frame the right flank)
      [0.305, 2690, 610, 0.40, 0.53, 1080],
      [0.435, 3060, 1230, 0.46, 0.52, 1060],   // 02 GPU owners: the arcades
      [0.575, 3090, 1300, 0.46, 0.52, 1060],
      [0.705, 3255, 1800, 0.46, 0.52, 1100],   // 03 open-model community: the foundation and its cranes
      [0.845, 3270, 1870, 0.46, 0.52, 1100],
      [1.000, 2050, 2805, 0.50, 1.00, 1400],   // the ground, the city and the harbour, then night
    ],
    tall: [
      [0.000, 1935, 30, 0.50, 0.60, 2500],
      [0.030, 1935, 30, 0.50, 0.60, 2500],
      [0.165, 1960, 520, 0.50, 0.80, 1500],
      [0.305, 1960, 600, 0.50, 0.80, 1500],
      [0.435, 2000, 1250, 0.50, 0.80, 1500],
      [0.575, 2000, 1330, 0.50, 0.80, 1500],
      [0.705, 2200, 1850, 0.50, 0.80, 1500],
      [0.845, 2200, 1930, 0.50, 0.80, 1500],
      [1.000, 2050, 2805, 0.50, 1.00, 2000],
    ],
  };
  // copy windows [in0, in1, out0, out1]; each door holds fully opaque for ~0.7 of a screen
  const WIN = {
    hero: [-1, -1, 0.03, 0.08],
    1: [0.125, 0.160, 0.310, 0.345],
    2: [0.395, 0.430, 0.580, 0.615],
    3: [0.665, 0.700, 0.850, 0.885],
    index: [0.07, 0.11, 0.90, 0.94],
  };
  const DOOR_AT = { 1: 0.235, 2: 0.505, 3: 0.775 };
  const SNAPS = [0, DOOR_AT[1], DOOR_AT[2], DOOR_AT[3], 1];
  const HERO_ANCHOR = [1935, 30];

  const stage = document.getElementById('stage');
  const climb = document.getElementById('climb');
  const hero = document.getElementById('hero');
  const nav = document.getElementById('nav');
  const index = document.getElementById('index');
  const doors = [1, 2, 3].map((n) => document.getElementById('door-' + n));
  const doorInner = doors.map((d) => d.querySelector('.door-in'));
  const indexLinks = [...index.querySelectorAll('a')];

  // mobile menu
  const menuBtn = nav.querySelector('.menu-btn');
  menuBtn.addEventListener('click', () => {
    const open = !nav.classList.contains('open');
    nav.classList.toggle('open', open); menuBtn.setAttribute('aria-expanded', String(open));
  });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && nav.classList.contains('open')) menuBtn.click(); });

  // theme switch: the same stored key the app pages read, so the choice follows you across the site
  nav.querySelector('.theme').addEventListener('click', () => {
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    try { localStorage.setItem('computenetwork_theme', next); } catch (e) { /* private mode: this page view only */ }
    dispatchEvent(new Event('themechange'));
  });

  // Token dropdown: opens on hover (with a short grace so the pointer can cross into the panel) or click
  const tok = document.getElementById('tok'), tokBtn = tok.querySelector('.tok-btn');
  let tokT = 0;
  const tokSet = (open) => { clearTimeout(tokT); tok.classList.toggle('open', open); tokBtn.setAttribute('aria-expanded', String(open)); };
  tok.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') tokSet(true); });
  tok.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') tokT = setTimeout(() => tokSet(false), 120); });
  tokBtn.addEventListener('click', () => tokSet(!tok.classList.contains('open')));
  tok.addEventListener('focusout', (e) => { if (!tok.contains(e.relatedTarget)) tokSet(false); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') tokSet(false); });

  // ---------------- helpers ----------------
  const ease = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const smooth = (a, b, x) => { if (x <= a) return 0; if (x >= b) return 1; const t = (x - a) / (b - a); return t * t * (3 - 2 * t); };
  const vis = (w, p) => (w[0] < 0 ? 1 : smooth(w[0], w[1], p)) * (1 - smooth(w[2], w[3], p));
  const widen = (w, d) => [w[0] < 0 ? -1 : w[0] - d, w[1] - d, w[2] + d, w[3] + d];
  const modeOf = (w, h) => (w < 760 || w / h < 0.9) ? 'tall' : 'wide';
  function camFromKey(K, vw, vh) {
    const s = vh / K[5];
    return { cx: K[1] + (0.5 - K[3]) * vw / s, cy: K[2] + (0.5 - K[4]) * vh / s, s };
  }
  function camAt(keys, p, vw, vh) {
    if (p <= keys[0][0]) return camFromKey(keys[0], vw, vh);
    for (let i = 1; i < keys.length; i++) {
      if (p <= keys[i][0]) {
        const a = camFromKey(keys[i - 1], vw, vh), b = camFromKey(keys[i], vw, vh);
        const t = ease((p - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0]));
        return { cx: a.cx + (b.cx - a.cx) * t, cy: a.cy + (b.cy - a.cy) * t, s: Math.exp(Math.log(a.s) + (Math.log(b.s) - Math.log(a.s)) * t) };
      }
    }
    return camFromKey(keys[keys.length - 1], vw, vh);
  }
  const project = (cam, X, Y, vw, vh) => [(X - cam.cx) * cam.s + vw / 2, (Y - cam.cy) * cam.s + vh / 2];

  // ---------------- WebGL2 dither renderer ----------------
  const MAX_CLR = 4;
  const VS = `#version 300 es
in vec2 a; void main() { gl_Position = vec4(a, 0.0, 1.0); }`;
  const FS = `#version 300 es
precision highp float; precision highp int;
uniform vec2 uRes;            // device px
uniform sampler2D uTex;
uniform sampler2D uColor;      // the painting itself: the lens looks through the dither at it
uniform vec2 uTexSize;
uniform float uTexScale;      // texels per painting px
uniform vec3 uCam;            // painting x, y at the viewport centre; device px per painting px
uniform vec2 uOff;            // integer device px: anchors the cell grid to the painting
uniform vec3 uCells;          // coarse, mid, fine cell sizes (device px)
uniform vec3 uLens;           // centre x, y (device px), device px per mark unit
uniform float uLensAmt;
uniform vec4 uClr[${MAX_CLR}];        // clearings, device px
uniform float uClrA[${MAX_CLR}];
uniform int uNClr;
uniform float uFeather;
uniform float uBuild;
uniform vec2 uRamp;
uniform float uDark;          // 1: paper dots on night (the dark theme)
out vec4 outColor;
const vec3 PAPER = vec3(250.0, 248.0, 246.0) / 255.0;
const vec3 INK = vec3(20.0, 18.0, 16.0) / 255.0;
const vec3 NIGHT = vec3(12.0, 10.0, 9.0) / 255.0;

float bayer8(ivec2 c) {             // same matrix as prep.py / render.py bayer(8)
  int x = c.x & 7, y = c.y & 7, xr = x ^ y;
  int v = ((xr & 1) << 5) | ((y & 1) << 4) | ((xr & 2) << 2) | ((y & 2) << 1) | ((xr & 4) >> 1) | ((y & 4) >> 2);
  return (float(v) + 0.5) / 64.0;
}
float hash(ivec2 c) {
  uint h = uint(c.x) * 374761393u + uint(c.y) * 668265263u;
  h = (h ^ (h >> 13u)) * 1274126177u;
  return float((h ^ (h >> 16u)) & 65535u) / 65536.0;
}
float sdSeg(vec2 p, vec2 a, vec2 b, float ra, float rb) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - mix(ra, rb, h);
}
float sdMark(vec2 q, float w) {     // the triad mark in its 100-unit artboard (same as direction B)
  float d = length(q - vec2(26.0, 72.0)) - 12.0;
  d = min(d, length(q - vec2(54.0, 22.0)) - 8.0);
  d = min(d, length(q - vec2(80.0, 64.0)) - 10.0);
  d = min(d, sdSeg(q, vec2(26.0, 72.0), vec2(54.0, 22.0), 4.5 * w, 3.0 * w));
  d = min(d, sdSeg(q, vec2(54.0, 22.0), vec2(80.0, 64.0), 3.0 * w, 3.75 * w));
  d = min(d, sdSeg(q, vec2(80.0, 64.0), vec2(26.0, 72.0), 3.75 * w, 4.5 * w));
  return d;
}
float lens(vec2 p) {
  vec2 q = (p - uLens.xy) / uLens.z + vec2(53.0, 49.0);
  return uLensAmt * clamp(0.5 - (sdMark(q, 1.25) - 0.5) / 4.0, 0.0, 1.0);
}
ivec2 cellOf(vec2 ip, float cs) { return ivec2(floor(ip / cs)); }

void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 ip = floor(p) + uOff;                      // painting-anchored device coordinate
  float cs = uCells.x;
  ivec2 cell = cellOf(ip, cs);
  vec2 cen = (vec2(cell) + 0.5) * cs - uOff;      // cell centre, screen device px
  float b = bayer8(cell);
  vec2 P = uCam.xy + (cen - uRes * 0.5) / uCam.z;  // painting px
  vec2 uv = P * uTexScale / uTexSize;
  float c = 0.0;
  if (uv.x >= 0.0 && uv.y >= 0.0 && uv.x < 1.0 && uv.y < 1.0) {
    float lod = log2(max(cs / uCam.z * uTexScale, 1.0)) - 0.4;
    c = textureLod(uTex, uv, max(lod, 0.0)).r;
  }
  float r = clamp((P.y - uRamp.x) / (uRamp.y - uRamp.x), 0.0, 1.0);
  float rs = r * r * (3.0 - 2.0 * r);
  // light: the ground dithers down into the night footer; dark: the dots thin out into the night ground
  c = uDark > 0.5 ? c * (1.0 - rs) : max(c, rs);
  if (uBuild < 1.0 && (1.0 - P.y / 2810.0) * 0.72 + hash(cellOf(ip, uCells.x)) * 0.28 >= uBuild) c = 0.0;
  float clr = 0.0;
  for (int i = 0; i < ${MAX_CLR}; i++) {
    if (i >= uNClr) break;
    vec4 R = uClr[i];
    vec2 d2 = max(max(R.xy - cen, cen - R.zw), vec2(0.0));
    clr = max(clr, uClrA[i] * clamp(1.0 - length(d2) / uFeather, 0.0, 1.0));
  }
  c *= smoothstep(0.12, 1.0, 1.0 - clr);   // reach zero before the clearing edge: no stray dotted border
  vec3 GROUND = uDark > 0.5 ? NIGHT : PAPER;
  vec3 dith = c > b ? (uDark > 0.5 ? PAPER : (P.y > uRamp.x ? NIGHT : INK)) : GROUND;
  // inside the triad lens: the painting, per pixel, with a dithered edge
  float lm = uLensAmt > 0.0 ? lens(p) : 0.0;
  if (lm > bayer8(cellOf(ip, uCells.z))) {
    vec2 Pp = uCam.xy + (p - uRes * 0.5) / uCam.z;
    vec2 uvp = Pp * uTexScale / uTexSize;
    vec3 col = (uvp.x >= 0.0 && uvp.y >= 0.0 && uvp.x < 1.0 && uvp.y < 1.0) ? texture(uColor, uvp).rgb : GROUND;
    float rp = clamp((Pp.y - uRamp.x) / (uRamp.y - uRamp.x), 0.0, 1.0);
    col = mix(col, NIGHT, rp * rp * (3.0 - 2.0 * rp));
    col = mix(col, GROUND, clamp(clr, 0.0, 1.0));
    dith = col;
  }
  outColor = vec4(dith, 1.0);
}`;

  function makeRenderer(canvas, opts) {
    const gl = canvas.getContext('webgl2', Object.assign({ antialias: false, alpha: false, depth: false, stencil: false,
      premultipliedAlpha: false, powerPreference: 'high-performance' }, opts));
    if (!gl) return null;
    const sh = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aLoc = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(aLoc); gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0);
    const U = {};
    ['uRes', 'uTex', 'uColor', 'uTexSize', 'uTexScale', 'uCam', 'uOff', 'uCells', 'uLens', 'uLensAmt', 'uClr', 'uClrA', 'uNClr',
      'uFeather', 'uBuild', 'uRamp', 'uDark'].forEach((n) => { U[n] = gl.getUniformLocation(prog, n); });
    gl.uniform1i(U.uTex, 0);
    gl.uniform1i(U.uColor, 1);
    gl.uniform2f(U.uRamp, RAMP[0], RAMP[1]);
    let tex = null, ctex = null, tw = 1, th = 1;
    const clr = new Float32Array(MAX_CLR * 4), clrA = new Float32Array(MAX_CLR);
    return {
      gl,
      setImage(img) {
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
        tex = gl.createTexture(); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, gl.RED, gl.UNSIGNED_BYTE, img);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.generateMipmap(gl.TEXTURE_2D);
        tw = img.naturalWidth; th = img.naturalHeight;
      },
      setColor(img) {
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        if (ctex) gl.deleteTexture(ctex);
        const t = ctex = gl.createTexture(); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB8, gl.RGB, gl.UNSIGNED_BYTE, img);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.activeTexture(gl.TEXTURE0);
      },
      get ready() { return !!tex; },
      // f: { W, H (device px), cam {cx, cy, s (css px per painting px)}, k (device px per css px), cells,
      //      lens {x, y, amt} (css px), lensBox (css px per 100 mark units), clears [[x0,y0,x1,y1,amt]] (css), feather (css), build }
      draw(f) {
        if (!tex) return;
        const k = f.k, sd = f.cam.s * k;
        gl.viewport(0, 0, f.W, f.H);
        gl.uniform2f(U.uRes, f.W, f.H);
        gl.uniform2f(U.uTexSize, tw, th);
        gl.uniform1f(U.uTexScale, PAINT.scale);
        gl.uniform3f(U.uCam, f.cam.cx, f.cam.cy, sd);
        gl.uniform2f(U.uOff, Math.round(f.cam.cx * sd - f.W / 2), Math.round(f.cam.cy * sd - f.H / 2));
        gl.uniform3f(U.uCells, f.cells[0], f.cells[1], f.cells[2]);
        gl.uniform3f(U.uLens, f.lens.x * k, f.lens.y * k, f.lensBox / 100 * k);
        gl.uniform1f(U.uLensAmt, f.lens.amt);
        let n = 0;
        for (const c of f.clears) {
          if (n >= MAX_CLR || c[4] <= 0.001) continue;
          clr.set([c[0] * k, c[1] * k, c[2] * k, c[3] * k], n * 4); clrA[n] = c[4]; n++;
        }
        gl.uniform4fv(U.uClr, clr); gl.uniform1fv(U.uClrA, clrA); gl.uniform1i(U.uNClr, n);
        gl.uniform1f(U.uFeather, f.feather * k);
        gl.uniform1f(U.uBuild, f.build);
        gl.uniform1f(U.uDark, document.documentElement.dataset.theme === 'dark' ? 1 : 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
    };
  }

  // cell sizes in device px: 4 CSS px coarse, halving twice inside the lens, never finer than 2 device px
  function cellsFor(k) {
    const c = Math.max(2, Math.round(2 * k));     // the fine dither, everywhere
    return [c, c, Math.max(1, Math.round(k))];
  }
  const lensBoxFor = (w, h) => Math.min(620, Math.max(250, Math.min(w, h * 1.6) * 0.38));

  const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });

  function fail(why) {
    root.classList.add('rm', 'nogl');
    window.__tower = { mode: 'static', why };
  }

  if (RM) return startStatic();
  startLive();

  // ================= live: the sticky descent =================
  function startLive() {
    const canvas = document.getElementById('tower');
    let R;
    try { R = makeRenderer(canvas, { preserveDrawingBuffer: false }); } catch (e) { console.error(e); }
    if (!R) { startStatic(); return; }

    let cssW = 1, cssH = 1, k = 1, cells = [4, 2, 2], span = 1;
    let heroRect = [0, 0, 0, 0], doorRects = [], navBottom = 84;
    const snaps = document.getElementById('snaps');
    SNAPS.forEach(() => snaps.appendChild(document.createElement('i')));

    function layout() {
      cssW = stage.clientWidth; cssH = stage.clientHeight;
      const W = canvas.width || Math.round(cssW * devicePixelRatio);
      k = W / cssW;
      cells = cellsFor(k);
      span = climb.offsetHeight - cssH;
      [...snaps.children].forEach((el, i) => { el.style.top = Math.round(SNAPS[i] * span) + 'px'; });
      const sr = stage.getBoundingClientRect();
      const rel = (r, pad) => [r.left - sr.left - pad, r.top - sr.top - pad, r.right - sr.left + pad, r.bottom - sr.top + pad];
      const tall = modeOf(cssW, cssH) === 'tall';
      // read untransformed boxes
      const saved = [hero, ...doors].map((el) => el.style.transform);
      [hero, ...doors].forEach((el) => { el.style.transform = 'none'; });
      heroRect = rel(hero.getBoundingClientRect(), 28);
      doorRects = doorInner.map((el) => {
        const r = rel(el.getBoundingClientRect(), tall ? 26 : 40);
        return tall ? [-1e5, -1e5, 1e5, r[3]] : r;     // phones: the copy sits on paper at the top
      });
      [hero, ...doors].forEach((el, i) => { el.style.transform = saved[i]; });
      navBottom = nav.getBoundingClientRect().bottom - sr.top;
      dirty = true;
    }
    const ro = new ResizeObserver((entries) => {
      const e = entries[0];
      let w, h;
      if (e.devicePixelContentBoxSize) { w = e.devicePixelContentBoxSize[0].inlineSize; h = e.devicePixelContentBoxSize[0].blockSize; }
      else { w = Math.round(e.contentRect.width * devicePixelRatio); h = Math.round(e.contentRect.height * devicePixelRatio); }
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      layout(); pTgt = pCur = progress(); wake();
    });
    try { ro.observe(canvas, { box: 'device-pixel-content-box' }); } catch (_) { ro.observe(canvas); }
    if (document.fonts) document.fonts.ready.then(() => { layout(); wake(); });

    const progress = () => Math.min(1, Math.max(0, -climb.getBoundingClientRect().top / Math.max(1, span)));
    const scrollToP = (p) => scrollTo({ top: climb.getBoundingClientRect().top + scrollY + p * span, behavior: 'smooth' });
    [...indexLinks, hero.querySelector('.cue')].forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); scrollToP(DOOR_AT[a.dataset.door]); }));
    // keyboard: focusing hidden copy brings its door into view
    hero.addEventListener('focusin', () => { if (pTgt > 0.03) scrollToP(0); });
    doors.forEach((d, i) => d.addEventListener('focusin', () => { if (vis(WIN[i + 1], pTgt) < 0.95) scrollToP(DOOR_AT[i + 1]); }));

    // ---- lens: follows a mouse or pen with easing; on touch it follows the finger, then settles and stops ----
    const lens = { x: -1, y: -1, tx: -1, ty: -1, amt: 0, user: false, hidden: false };
    // the pointer in viewport px; the stage scrolls away under the footer, so it is mapped onto the stage every frame
    const ptr = { x: 0, y: 0, on: false, mouse: false };   // mouse: a real pointer has been seen, so never auto-park
    // painting px of the hardware painted into each door's scene; arriving at a door parks the lens on it
    const SCENE = { 1: [2359, 573], 2: [2710, 1510], 3: [2905, 2000] };
    let restDoor = 0;
    addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      ptr.x = e.clientX; ptr.y = e.clientY; ptr.on = true; ptr.mouse = true; lens.user = true; wake();
    }, { passive: true });
    document.documentElement.addEventListener('mouseleave', () => { ptr.on = false; wake(); });
    const onTouch = (e) => { const t = e.touches[0]; if (!t) return; ptr.x = t.clientX; ptr.y = t.clientY; ptr.on = true; lens.user = true; wake(); };
    addEventListener('touchstart', onTouch, { passive: true });
    addEventListener('touchmove', onTouch, { passive: true });

    // ---- frame loop ----
    let pCur = 0, pTgt = 0, last = 0, raf = 0, dirty = true, frames = 0, build = 0, buildT0 = -1, lastKey = '';
    function wake() { if (!raf) { last = 0; raf = requestAnimationFrame(frame); } }
    addEventListener('scroll', () => { pTgt = progress(); wake(); }, { passive: true });

    function frame(now) {
      raf = 0;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60; last = now;
      let busy = false;
      pCur += (pTgt - pCur) * (1 - Math.exp(-dt / 0.085));
      if (Math.abs(pTgt - pCur) < 0.00004) pCur = pTgt; else busy = true;
      if (R.ready && buildT0 < 0) buildT0 = now;
      if (buildT0 >= 0 && build < 1) { build = Math.min(1, (now - buildT0) / 1500); busy = true; }

      const m = modeOf(cssW, cssH), tall = m === 'tall';
      const cam = camAt(KF[m], pCur, cssW, cssH);

      // lens target: the pointer. Without a mouse (touch, or before the first move) arriving at a door parks the
      // lens on that door's scene; with a mouse it never leaves the pointer, or it would fly off while scrolling
      let atDoor = 0;
      for (const i of [1, 2, 3]) if (vis(WIN[i], pCur) > 0.9) atDoor = i;
      if (atDoor !== restDoor) { restDoor = atDoor; if (atDoor && !ptr.mouse) lens.user = false; }
      if (!lens.user) {
        lens.hidden = false;
        if (atDoor) { const q = project(cam, SCENE[atDoor][0], SCENE[atDoor][1], cssW, cssH); lens.tx = q[0]; lens.ty = q[1]; }
        else { lens.tx = cssW * 0.5; lens.ty = cssH * (tall ? 0.8 : 0.68); }
      } else {
        // follow the pointer only while it is over the tower; over the footer (or off the page) the lens fades
        // out, and it comes back exactly where the pointer re-enters instead of sliding over from where it left
        const sr = stage.getBoundingClientRect();
        const inside = ptr.on && ptr.x >= sr.left && ptr.x < sr.right && ptr.y >= sr.top && ptr.y < sr.bottom;
        if (inside) {
          lens.tx = ptr.x - sr.left; lens.ty = ptr.y - sr.top;
          if (lens.hidden && lens.amt < 0.05) { lens.x = lens.tx; lens.y = lens.ty; }
        }
        lens.hidden = !inside;
      }
      if (lens.x < 0) { lens.x = lens.tx; lens.y = lens.ty; }
      const dx = lens.tx - lens.x, dy = lens.ty - lens.y, le = 1 - Math.exp(-dt * 7);
      if (Math.abs(dx) + Math.abs(dy) > 0.25) { lens.x += dx * le; lens.y += dy * le; busy = true; } else { lens.x = lens.tx; lens.y = lens.ty; }
      const at = build >= 0.6 && !lens.hidden ? 1 : 0, da = at - lens.amt;
      if (Math.abs(da) > 0.002) { lens.amt += da * (1 - Math.exp(-dt * (at ? 4 : 9))); busy = true; } else lens.amt = at;

      // copy
      const h0 = project(camAt(KF[m], 0, cssW, cssH), HERO_ANCHOR[0], HERO_ANCHOR[1], cssW, cssH)[1];
      const hy = project(cam, HERO_ANCHOR[0], HERO_ANCHOR[1], cssW, cssH)[1] - h0;   // the hero rides up with the sky
      const ho = vis(WIN.hero, pCur);
      hero.style.opacity = ho.toFixed(3);
      hero.style.transform = `translate3d(0, ${hy.toFixed(1)}px, 0)`;
      hero.style.visibility = ho < 0.01 ? 'hidden' : 'visible';
      const clears = [[-1e5, -1e5, 1e5, navBottom - 14, 1], [heroRect[0], heroRect[1] + hy, heroRect[2], heroRect[3] + hy, ho]];
      doors.forEach((d, i) => {
        const o = vis(WIN[i + 1], pCur);
        d.style.opacity = o.toFixed(3);
        d.style.visibility = o < 0.01 ? 'hidden' : 'visible';
        d.style.transform = `translate3d(0, ${((1 - o) * 18).toFixed(1)}px, 0)`;
        d.style.pointerEvents = 'none';
        doorInner[i].style.pointerEvents = o > 0.5 ? 'auto' : 'none';
        const r = doorRects[i];
        // wide: no clearing, the camera frames the tower's flank so the copy sits in open paper beside it
        if (r && tall) clears.push([r[0], r[1], r[2], r[3], vis(widen(WIN[i + 1], 0.02), pCur)]);
      });
      const io = vis(WIN.index, pCur);
      index.style.opacity = io.toFixed(3);
      index.style.visibility = io < 0.01 ? 'hidden' : 'visible';
      indexLinks.forEach((a, i) => a.classList.toggle('on', vis(WIN[i + 1], pCur) > 0.5));

      const key = [cam.cx.toFixed(2), cam.cy.toFixed(2), cam.s.toFixed(5), lens.x.toFixed(1), lens.y.toFixed(1), lens.amt.toFixed(3),
        build.toFixed(3), clears.map((c) => c[4].toFixed(3) + c[1].toFixed(0)).join(','), canvas.width, canvas.height,
        root.dataset.theme || ''].join('|');
      if (R.ready && (dirty || key !== lastKey)) {
        R.draw({ W: canvas.width, H: canvas.height, k, cam, cells, lens, lensBox: lensBoxFor(cssW, cssH), clears,
          feather: tall ? 56 : 64, build: build < 1 ? ease(build) * 1.02 : 1 });
        lastKey = key; dirty = false; frames++;
      }
      if (busy) wake();
    }

    window.__tower = { mode: 'live', get frames() { return frames; }, get progress() { return pCur; }, get ready() { return build >= 1 && lens.amt >= 1; },
      renderer: (() => { const d = R.gl.getExtension('WEBGL_debug_renderer_info'); return d ? R.gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'webgl2'; })() };

    // the lens' painting sits on the theme's ground, so each theme has its own colour texture
    let colorFor = '';
    const loadColor = () => {
      const want = root.dataset.theme === 'dark' ? 'dark' : 'light';
      if (colorFor === want) return;
      colorFor = want;
      loadImg(want === 'dark' ? PAINT.colorDark : PAINT.color)
        .then((img) => { if (colorFor === want) { R.setColor(img); dirty = true; wake(); } }).catch((e) => console.error(e));
    };
    loadImg(PAINT.src).then((img) => { R.setImage(img); dirty = true; wake(); loadColor(); }).catch((e) => { console.error(e); });
    addEventListener('themechange', () => { loadColor(); dirty = true; wake(); });
    layout(); pTgt = pCur = progress(); wake();
  }

  // ================= reduced motion: static stacked sections =================
  function startStatic() {
    root.classList.add('rm');
    const glc = document.createElement('canvas');
    let R = null;
    try { R = makeRenderer(glc, { preserveDrawingBuffer: true }); } catch (e) { console.error(e); }
    if (!R) { fail('no webgl2'); return; }
    const parts = [['hero', hero, 0], [1, doors[0], DOOR_AT[1]], [2, doors[1], DOOR_AT[2]], [3, doors[2], DOOR_AT[3]], ['base', null, 1]];
    const climbEl = document.getElementById('climb');
    const panels = parts.map(([key, el, p]) => {
      const panel = document.createElement('div');
      panel.className = 'panel' + (key === 'base' ? ' base' : '');
      const c = document.createElement('canvas');
      c.setAttribute('aria-hidden', 'true');
      panel.appendChild(c);
      if (el) { el.parentNode.insertBefore(panel, el); panel.appendChild(el); } else climbEl.appendChild(panel);
      return { key, el, p, panel, c };
    });
    // the nav rides on the first panel
    panels[0].panel.appendChild(nav);
    function render() {
      if (!R.ready) return;
      for (const { key, el, p, panel, c } of panels) {
        const w = panel.clientWidth, h = panel.clientHeight, k = devicePixelRatio || 1;
        const W = Math.round(w * k), H = Math.round(h * k);
        glc.width = W; glc.height = H; c.width = W; c.height = H;
        const m = modeOf(w, h);
        let cam;
        if (key === 'base') {    // the ground: bottom of the panel = solid night, straight into the footer
          const s = h / (m === 'tall' ? 900 : 760);
          cam = { cx: 2050, cy: 2805 - h / 2 / s, s };
        } else cam = camAt(KF[m], p, w, h);
        const pr = panel.getBoundingClientRect();
        const clears = [];
        if (key === 'hero') clears.push([-1e5, -1e5, 1e5, 84, 1]);
        if (el) {
          const t = (el.querySelector('.door-in') || el).getBoundingClientRect();
          const pad = 36, rr = [t.left - pr.left - pad, t.top - pr.top - pad, t.right - pr.left + pad, t.bottom - pr.top + pad, 1];
          clears.push(m === 'tall' && key !== 'hero' ? [-1e5, -1e5, 1e5, rr[3], 1] : rr);
        }
        R.draw({ W, H, k, cam, cells: cellsFor(k), lens: { x: 0, y: 0, amt: 0 }, lensBox: 100, clears, feather: 64, build: 1 });
        c.getContext('2d').drawImage(glc, 0, 0);
      }
    }
    loadImg(PAINT.src).then((img) => { R.setImage(img); render(); }).catch((e) => console.error(e));
    addEventListener('themechange', () => render());
    let t = 0;
    addEventListener('resize', () => { clearTimeout(t); t = setTimeout(render, 150); });
    if (document.fonts) document.fonts.ready.then(render);
    window.__tower = { mode: 'static' };
  }
})();
