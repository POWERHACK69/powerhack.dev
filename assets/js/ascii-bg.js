'use strict';

/**
 * Animated ASCII backgrounds, one procedural scene per page.
 *
 * Every frame a scene fills a grid of cells with an intensity (which picks
 * the glyph from a density ramp) and a palette index (which picks the colour).
 * The engine then blits each cell from a pre-rendered glyph atlas.
 */
(function () {

  const RAMP = ' .,:;~-=+*ox%#@';
  const GLYPHS = RAMP + '/\\|_^';
  const RL = RAMP.length;
  const G_SLASH = RL, G_BACK = RL + 1, G_PIPE = RL + 2, G_UNDER = RL + 3, G_CARET = RL + 4;
  const FPS = 20;
  const TAU = Math.PI * 2;



  // math helpers

  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const rand = (a, b) => a + Math.random() * (b - a);
  const angDiff = (a, b) => ((a - b + Math.PI) % TAU + TAU) % TAU - Math.PI;

  function hash2(x, y) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function noise2(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash2(xi, yi), b = hash2(xi + 1, yi);
    const c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }

  function fbm(x, y) {
    return noise2(x, y) * 0.5 + noise2(x * 2.03, y * 2.03 + 17.1) * 0.3 + noise2(x * 4.11, y * 4.11 + 31.7) * 0.2;
  }

  // thin bright lines where two drifting noise fields cross, like light on a pond floor
  function caustic(x, y, t, s) {
    const a = noise2(x * s + t * 0.06, y * s - t * 0.045);
    const b = noise2(x * s - t * 0.05 + 40.3, y * s + t * 0.05 + 11.7);
    const c = 1 - Math.abs(a - b) * 5;
    return c > 0 ? c * c * c : 0;
  }



  /**
   * mini-games (the site's easter eggs), one per scene. Games report each scoring moment as
   * { type: 'gain', value, x, y }, plus { type: 'mult', value } for streak multipliers and
   * { type: 'flash', text } for callouts; the page keeps the running, ever-growing total.
   */

  const TOYS = {
    about: { title: 'Wishing Stars', hint: 'Catch the shooting stars before they fall into the fjord', unit: 'wishes' },
    resume: { title: 'Bug Eater: Night Shift', hint: 'Snap your tongue at the fireflies · click a lily pad to hop · glowing bugs are worth more', unit: 'bugs eaten' },
    portfolio: { title: 'Koi Feast', hint: 'Click or drag to scatter food for the koi', unit: 'koi fed' },
    contact: { title: 'Glow Chain', hint: 'One spark per round · light a jellyfish and watch the glow spread · beware the void', unit: 'glow' }
  };

  // the k-th step up a scale built from the music's chord tones
  function scaleNote(key, k) {
    const n = key.slice().sort((a, b) => a - b);
    k = Math.min(k, n.length * 3 - 1);
    return n[k % n.length] + 12 * (1 + Math.floor(k / n.length));
  }

  function spawnBurst(list, x, y, n, speed, life, grp) {
    for (let k = 0; k < n; k++) {
      const a = k / n * TAU + rand(-0.3, 0.3), s = speed * rand(0.5, 1.1);
      list.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, age: 0, life: life * rand(0.7, 1.2), grp });
    }
  }

  function drawParticles(g, list, R, dt) {
    for (let n = list.length - 1; n >= 0; n--) {
      const p = list[n];
      p.age += dt;
      if (p.age > p.life) { list.splice(n, 1); continue; }
      const drag = Math.exp(-3 * dt);
      p.vx *= drag; p.vy *= drag;
      p.x += p.vx * dt; p.y += p.vy * dt;
      const f = 1 - p.age / p.life, k = g.at(p.x, p.y);
      if (k >= 0) g.max(k, 0.25 + 0.7 * f, pi(R[p.grp], f));
    }
  }



  // palette helpers

  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [n >> 16 & 255, n >> 8 & 255, n & 255];
  }

  // { name: [[stops...], count] } -> flat colour list plus { name: { o, n } } ranges
  function buildPalette(def) {
    const colors = [], ranges = {};
    for (const name in def) {
      const [stops, n] = def[name];
      const rgb = stops.map(hexToRgb);
      ranges[name] = { o: colors.length, n };
      for (let k = 0; k < n; k++) {
        const f = n === 1 ? 0 : k / (n - 1) * (rgb.length - 1);
        const s = Math.max(0, Math.min(rgb.length - 2, Math.floor(f)));
        const m = f - s, a = rgb[s], b = rgb[s + 1] || a;
        colors.push(`rgb(${Math.round(a[0] + (b[0] - a[0]) * m)},${Math.round(a[1] + (b[1] - a[1]) * m)},${Math.round(a[2] + (b[2] - a[2]) * m)})`);
      }
    }
    return { colors, ranges };
  }

  // palette index for fraction f (0..1) of a range
  const pi = (r, f) => r.o + (f <= 0 ? 0 : f >= 1 ? r.n - 1 : (f * (r.n - 1) + 0.5) | 0);



  /**
   * cell grid shared by all scenes, in CSS-pixel world coordinates
   */

  class Grid {

    setup(W, H, cw, ch) {
      this.W = W; this.H = H; this.cw = cw; this.ch = ch;
      this.cols = Math.ceil(W / cw);
      this.rows = Math.ceil(H / ch);
      const n = this.cols * this.rows;
      this.V = new Float32Array(n);
      this.P = new Uint16Array(n);
      this.G = new Uint8Array(n);
    }

    clear() { this.V.fill(0); this.P.fill(0); this.G.fill(0); }

    at(x, y) {
      const i = Math.floor(x / this.cw), j = Math.floor(y / this.ch);
      return i < 0 || j < 0 || i >= this.cols || j >= this.rows ? -1 : j * this.cols + i;
    }

    // visit every cell whose centre lies within r of (x, y)
    disc(x, y, r, fn) {
      const { cw, ch, cols, rows } = this;
      const i0 = Math.max(0, Math.floor((x - r) / cw)), i1 = Math.min(cols - 1, Math.floor((x + r) / cw));
      const j0 = Math.max(0, Math.floor((y - r) / ch)), j1 = Math.min(rows - 1, Math.floor((y + r) / ch));
      const r2 = r * r;
      for (let j = j0; j <= j1; j++) {
        const dy = (j + 0.5) * ch - y;
        for (let i = i0; i <= i1; i++) {
          const dx = (i + 0.5) * cw - x;
          const d2 = dx * dx + dy * dy;
          if (d2 <= r2) fn(j * cols + i, dx, dy, Math.sqrt(d2));
        }
      }
    }

    // visit cells along a segment; fn gets (cell, position along segment 0..1)
    line(x0, y0, x1, y1, r, fn) {
      const len = Math.hypot(x1 - x0, y1 - y0);
      const steps = Math.max(1, Math.ceil(len / (Math.min(this.cw, this.ch) * 0.5)));
      for (let s = 0; s <= steps; s++) {
        const f = s / steps, x = x0 + (x1 - x0) * f, y = y0 + (y1 - y0) * f;
        if (r < this.cw * 0.6) {
          const k = this.at(x, y);
          if (k >= 0) fn(k, f);
        } else {
          this.disc(x, y, r, (k) => fn(k, f));
        }
      }
    }

    max(k, v, p) {
      if (v > this.V[k]) { this.V[k] = v; this.P[k] = p; this.G[k] = 0; }
    }

  }



  /**
   * shared pond pieces: lily pads, lotus flowers and ripples
   */

  function makePad(x, y, R, flower) {
    return {
      x, y, R,
      rot: rand(0, TAU), vr: rand(-0.03, 0.03),
      vx: rand(-2.5, 2.5), vy: rand(-1.5, 1.5),
      notch: rand(0.12, 0.2), veins: 7 + (Math.random() * 4 | 0), seed: rand(0, 100),
      flower: flower ? { r: R * rand(0.5, 0.66), rot: rand(0, TAU), ph: rand(0, TAU) } : null
    };
  }

  function movePad(p, g, dt) {
    p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    const m = p.R + 12;
    if (p.x < -m) p.x = g.W + m; else if (p.x > g.W + m) p.x = -m;
    if (p.y < -m) p.y = g.H + m; else if (p.y > g.H + m) p.y = -m;
  }

  function drawPad(g, p, Rpad, Rwater) {
    const { V, P, G } = g;

    // soft shadow on the water
    g.disc(p.x + p.R * 0.12 + 3, p.y + p.R * 0.18 + 4, p.R, (k) => { V[k] *= 0.35; P[k] = Rwater.o; });

    g.disc(p.x, p.y, p.R, (k, dx, dy, d) => {
      let a = Math.atan2(dy, dx) - p.rot;
      a = ((a % TAU) + TAU + Math.PI) % TAU - Math.PI;
      if (Math.abs(a) < p.notch && d > p.R * 0.1) return;

      const q = d / p.R;
      let v = 0.44 + 0.2 * noise2(dx * 0.09 + p.seed, dy * 0.09) - 0.08 * q;
      if (Math.abs(Math.sin(a * p.veins)) < 0.12 && q > 0.1 && q < 0.88) v = 0.3;
      if (q > 0.9) v = 0.68;
      if (q < 0.06) v = 0.65;
      V[k] = v; P[k] = pi(Rpad, (v - 0.25) * 1.5); G[k] = 0;
    });
  }

  function drawLotus(g, f, cx, cy, t, Rpetal, Rseed) {
    const { V, P, G } = g;
    const r = f.r * (1 + 0.04 * Math.sin(t * 0.7 + f.ph));

    g.disc(cx, cy, r, (k, dx, dy, d) => {
      const b = Math.atan2(dy, dx) - f.rot - t * 0.02;
      const q = d / r;
      let v, c;

      if (q < 0.17) {
        v = 0.55 + 0.4 * noise2(dx * 0.5 + f.ph, dy * 0.5);
        c = pi(Rseed, v);
      } else {
        const outer = 0.55 + 0.45 * Math.pow(Math.abs(Math.cos(b * 4)), 0.6);
        const mid = 0.42 + 0.3 * Math.pow(Math.abs(Math.cos(b * 4 + Math.PI / 2)), 0.6);
        const inner = 0.28 + 0.16 * Math.pow(Math.abs(Math.cos(b * 3)), 0.6);
        let edge;
        if (q < inner) { v = 0.92; c = 0.97 - q * 0.4; edge = inner - q; }
        else if (q < mid) { const e = (q - inner) / (mid - inner); v = 0.84 - e * 0.1; c = 0.8 - e * 0.25; edge = mid - q; }
        else if (q < outer) { const e = (q - mid) / (outer - mid); v = 0.76 - e * 0.12; c = 0.58 - e * 0.33; edge = outer - q; }
        else return;
        // darker crease where petals overlap
        if (edge < 0.06) { v *= 0.65; c *= 0.75; }
        c = pi(Rpetal, c);
      }

      V[k] = v; P[k] = c; G[k] = 0;
    });
  }

  function drawRipples(g, ripples, Rr, dt) {
    const { V, P, G } = g;
    for (let n = ripples.length - 1; n >= 0; n--) {
      const r = ripples[n];
      r.age += dt;
      if (r.age > r.life) { ripples.splice(n, 1); continue; }
      const f = r.age / r.life, rad = r.size * f, s = (1 - f) * (1 - f) * r.str;
      g.disc(r.x, r.y, rad + 6, (k, dx, dy, d) => {
        const ring = Math.exp(-Math.pow((d - rad) / 3, 2)) * s + 0.5 * Math.exp(-Math.pow((d - rad * 0.62) / 3, 2)) * s;
        if (ring > 0.06 && ring > V[k]) { V[k] = ring; P[k] = pi(Rr, ring); G[k] = 0; }
      });
    }
  }



  /**
   * #ABOUT: aurora curtains rippling over a still fjord, a cabin lit on the shore
   */

  function auroraScene() {

    let hz, far, near, cabin, smoke;
    let _v = 0, _p = 0, _a = 0, _cf = 0, _h = 0;
    let boost = 0;   // the aurora flares while a wishing streak is going

    // shape the cabin from glyphs; '.' is wall, 'W' the lit window
    const CABIN = [
      '   /\\   ',
      '  /..\\  ',
      ' /____\\ ',
      '  |W.|  ',
      '  |__|  '
    ];

    // one aurora ribbon: a meandering bright lower edge with rays rising off it;
    // returns strength and leaves the height within the curtain in _h
    function curtain(H, x, y, t, base, amp, fx, ft, hgt, seed) {
      const yb = H * base + H * amp * Math.sin(x * fx + t * ft + seed) + H * amp * 0.5 * Math.sin(x * fx * 2.3 - t * ft * 1.7 + seed * 2);
      const dy = yb - y;
      if (dy < -H * 0.03 || dy > hgt) { _h = 0; return 0; }
      const prof = dy < 0
        ? Math.exp(dy / (H * 0.007))
        : Math.exp(-dy / (hgt * 0.38)) * (1 + 0.8 * Math.exp(-dy / (H * 0.015)));
      const ray = Math.pow(noise2(x * 0.05 + seed * 3 + t * 0.12, t * 0.22 + seed), 2.2) * 1.9;
      const env = 0.35 + 0.65 * noise2(x * 0.0035 + seed, t * 0.05);
      _h = clamp(dy / hgt, 0, 1);
      // drop the faintest wisps so the sky stays clean between rays
      return Math.max(0, prof * ray * env - 0.06);
    }

    // writes the sky's intensity/colour at (x, y) into _v/_p, plus raw aurora strength
    function sky(g, R, x, y, t) {
      const H = g.H;
      const glow = clamp((y - hz * 0.5) / (hz * 0.5), 0, 1);
      let v = 0.05 * glow * glow, p = pi(R.sky, glow);

      const h = hash2(((x / g.cw) | 0) * 7 + 3, ((y / g.ch) | 0) * 13 + 1);
      if (h > 0.985) {
        const b = (h - 0.985) / 0.015;
        const tw = 0.5 + 0.5 * Math.sin(t * (1.2 + b * 2.5) + h * 1000);
        const sv = 0.12 + 0.6 * tw * b;
        if (sv > v) { v = sv; p = pi(R.star, tw * b); }
      }

      const a1 = curtain(H, x, y, t, 0.42, 0.06, 0.0035, 0.12, H * 0.32, 0), h1 = _h;
      const a2 = 0.75 * curtain(H, x, y, t, 0.27, 0.05, 0.0027, -0.08, H * 0.24, 5.3), h2 = _h;
      const a = (Math.max(a1, a2) + 0.3 * Math.min(a1, a2)) * (1 + boost);
      _a = a > 1 ? 1 : a;
      _cf = a1 >= a2 ? h1 : h2;
      if (_a * 0.95 > v) { v = _a * 0.95; p = pi(R.aur, _cf); }

      _v = v; _p = p;
    }

    const S = {

      bg: '#03050b',

      palette: {
        sky: [['#070b18', '#16294d'], 5],
        star: [['#5d6a8c', '#f2f6ff'], 5],
        aur: [['#7dffc8', '#2ee6a0', '#17b38a', '#3a7fd0', '#8a5fe0', '#c45fd0'], 18],
        rock: [['#141a2c', '#2e3a58', '#5a6a90'], 6],
        snow: [['#4a5878', '#aab8d6', '#eef4ff'], 6],
        near: [['#05070c', '#141b2a', '#2c3850'], 5],
        water: [['#040812', '#0d2140', '#1d4470'], 6],
        refl: [['#3aa088', '#1f7a62', '#245a8a', '#5a4a96'], 10],
        warm: [['#3a1a06', '#c96a1a', '#ffbe5c', '#fff0c4'], 8],
        wood: [['#1a100a', '#4a3424', '#8a6a4c'], 4],
        fire: [['#5a0a04', '#d0301a', '#ff7a1a', '#ffd23a', '#fffbe8'], 14]
      },

      init(g) {
        const { W, H, cols, cw, ch } = g;
        hz = H * 0.64;
        far = new Float32Array(cols);
        near = new Float32Array(cols);
        const cabinX = W * (W < 700 ? 0.7 : 0.74);

        for (let i = 0; i < cols; i++) {
          const x = (i + 0.5) * cw;
          const r = 1 - Math.abs(fbm(x * 0.0032 + 3.7, 0.5) * 2 - 1);
          far[i] = hz - H * (0.05 + 0.24 * r * r);
          const e = Math.pow(Math.abs(x / W - 0.5) * 2, 2);
          let h = H * (0.42 * e * (0.55 + 0.45 * fbm(x * 0.007, 9.1)) - 0.01);
          h = Math.max(h, H * 0.03 * Math.exp(-Math.pow((x - cabinX) / (W * 0.07), 2)));
          near[i] = h > 0.5 ? hz - h : hz + 1;
        }

        const ci = clamp(Math.floor(cabinX / cw), 0, cols - 1);
        cabin = { i: ci - 4, j: Math.floor(near[ci] / ch) - 4 };
        cabin.wx = (cabin.i + 3.5) * cw;
        cabin.wy = (cabin.j + 3.5) * ch;
        smoke = Array.from({ length: 7 }, (_, n) => n / 7);
      },

      frame(g, t) {
        const { cols, rows, cw, ch, V, P, G, H } = g;
        const R = S.pal.ranges;

        for (let j = 0; j < rows; j++) {
          const y = (j + 0.5) * ch;
          for (let i = 0; i < cols; i++) {
            const x = (i + 0.5) * cw, k = j * cols + i;

            if (y < hz) {

              if (y >= near[i]) {
                // foreground headlands: near-black with a faint rim
                const dd = y - near[i];
                const v = dd < ch ? 0.32 : 0.06 + 0.09 * noise2(x * 0.06, y * 0.06);
                V[k] = v; P[k] = pi(R.near, v * 2.8);

              } else if (y >= far[i]) {
                // distant mountains with snowy peaks
                const dd = y - far[i], peak = hz - far[i];
                const snowLine = peak * (0.22 + 0.2 * noise2(x * 0.02, 3.1));
                const tex = noise2(x * 0.08, y * 0.05);
                const slope = (far[Math.min(cols - 1, i + 1)] - far[Math.max(0, i - 1)]) / (2 * cw);
                const lit = clamp(0.5 - slope * 1.2, 0, 1);
                let v, p;
                if (dd < snowLine) {
                  v = (0.22 + 0.45 * lit) * (1 - 0.6 * dd / snowLine) + 0.15 * tex;
                  p = pi(R.snow, v * 1.3);
                } else {
                  v = 0.1 + 0.16 * tex * (0.5 + lit) + 0.05 * (1 - dd / peak);
                  p = pi(R.rock, v * 2.6);
                }
                if (dd < ch * 0.9) { v = Math.max(v, 0.4); p = pi(R.snow, 0.5); }
                V[k] = v; P[k] = p;

              } else {
                sky(g, R, x, y, t);
                V[k] = _v; P[k] = _p;
              }

            } else {

              // the fjord mirrors everything above it, broken up by slow ripples
              const df = (y - hz) / (H - hz);
              const xr = x + Math.sin(y * 0.13 - t * 1.2) * (1 + 5 * df) + Math.sin(y * 0.037 + t * 0.6) * 3 * df;
              const yr = hz - (y - hz) * 1.1;
              const ir = clamp((xr / cw) | 0, 0, cols - 1);
              let v, p;

              if (yr >= far[ir]) {
                v = 0.05 + 0.04 * noise2(xr * 0.08, yr * 0.05);
                p = pi(R.water, 0.3);
              } else {
                sky(g, R, xr, yr, t);
                const fade = 0.55 * (1 - df * 0.6);
                if (_a * fade > 0.04) { v = _a * fade; p = pi(R.refl, _cf); }
                else { v = _v * 0.5; p = _p; }
              }

              const st = noise2(x * 0.012 + t * 0.15, y * 0.22 - t * 0.1);
              const w = st > 0.78 ? 0.04 + (st - 0.78) * 1.2 : 0;
              if (w > v) { v = w; p = pi(R.water, 0.4 + st * 0.6); }

              // the cabin window's warm streak
              if (Math.abs(xr - cabin.wx) < 5 && y - hz < H * 0.22) {
                const f = 1 - (y - hz) / (H * 0.22);
                const s = noise2(x * 0.3, y * 0.2 - t * 2.5);
                const v2 = 0.55 * f * (0.3 + 0.7 * s);
                if (v2 > v) { v = v2; p = pi(R.warm, 0.3 + 0.6 * f * s); }
              }

              V[k] = v; P[k] = p;
            }
          }
        }

        // pines along the headland ridges
        for (let i = 0; i < cols; i++) {
          if (near[i] >= hz || hash2(i, 91) < 0.55) continue;
          const j = Math.floor(near[i] / ch) - 1;
          if (j < 0) continue;
          const k = j * cols + i;
          V[k] = 0.3; P[k] = pi(R.near, 0.85); G[k] = G_CARET;
        }

        // warm halo, chimney smoke, then the cabin itself
        g.disc(cabin.wx, cabin.wy, 42, (k, dx, dy, d) => {
          const v = 0.26 * Math.pow(1 - d / 42, 2);
          if (v > V[k]) { V[k] = v; P[k] = pi(R.warm, v * 1.5); G[k] = 0; }
        });

        for (let n = 0; n < smoke.length; n++) {
          const age = (t * 0.12 + smoke[n]) % 1;
          const sx = (cabin.i + 5.5) * cw + age * 26 + Math.sin(age * 6 + t * 0.8) * 5 * age;
          const sy = cabin.j * ch - age * 70;
          const k = g.at(sx, sy);
          if (k >= 0) g.max(k, 0.22 * (1 - age), pi(R.snow, 0.3 * (1 - age)));
        }

        const flick = 0.82 + 0.12 * noise2(t * 3, 4.2);
        for (let r = 0; r < CABIN.length; r++) {
          for (let c = 0; c < CABIN[r].length; c++) {
            const chr = CABIN[r][c];
            const i = cabin.i + c, j = cabin.j + r;
            if (chr === ' ' || i < 0 || j < 0 || i >= cols || j >= rows) continue;
            const k = j * cols + i;
            if (chr === 'W') { V[k] = flick; P[k] = pi(R.warm, 0.85); G[k] = 0; }
            else if (chr === '.') { V[k] = 0.12; P[k] = pi(R.wood, 0.4); G[k] = 0; }
            else {
              V[k] = 0.5; P[k] = pi(R.wood, 1);
              G[k] = chr === '/' ? G_SLASH : chr === '\\' ? G_BACK : chr === '|' ? G_PIPE : G_UNDER;
            }
          }
        }
      }
    };



    /**
     * mini-game "Wishing Stars": catch shooting stars before they fall into the fjord.
     * Each catch rings the next note up the scale; streaks make the aurora flare,
     * and every tenth wish something in the sky opens its eye.
     */

    let st = null;

    function drawEye(g, R, o, t) {
      const { W, H, V, P, G } = g;
      const rx = Math.min(W * 0.2, 230), ry = rx * 0.4 * o, ex = W / 2, ey = H * 0.24;
      if (ry < 2) return;
      const mx = g.mouse.x - ex, my = g.mouse.y - ey, md = Math.hypot(mx, my) || 1;
      const look = Math.min(rx * 0.3, md * 0.15);
      const ix = ex + mx / md * look, iy = ey + my / md * look * 0.45;
      const ri = rx * 0.36, rp = ri * (0.4 + 0.1 * Math.sin(t * 1.7));
      const rim = g.ch * 0.7;
      g.disc(ex, ey, rx + 4, (k, dx, dy) => {
        const f = 1 - (dx / rx) * (dx / rx);
        if (f <= 0) return;
        const lid = ry * Math.pow(f, 0.8);
        const ady = Math.abs(dy);
        if (ady > lid + rim) return;
        G[k] = 0;
        if (ady > lid - rim * 0.4) { V[k] = 0.9; P[k] = pi(R.snow, 0.9); return; }
        const di = Math.hypot(ex + dx - ix, ey + dy - iy);
        // the pupil is a hole punched through the sky
        if (di < rp) { V[k] = 0; return; }
        if (di < ri) {
          const v = 0.45 + 0.45 * Math.abs(Math.sin(Math.atan2(ey + dy - iy, ex + dx - ix) * 9 + di * 0.1));
          V[k] = v; P[k] = pi(R.aur, 0.1 + 0.7 * di / ri);
        } else {
          V[k] = 0.2; P[k] = pi(R.snow, 0.2);
        }
      });
    }

    S.toy = {

      start() {
        st = { stars: [], bursts: [], combo: 0, mult: 1, catches: 0, next: 0, eye: null, time: 0 };
      },

      stop() { st = null; boost = 0; },

      down(g, x, y) {
        const reach = g.touch ? 72 : 52;
        let best = null, bd = reach;
        for (const s of st.stars) {
          const d = Math.hypot(s.x - x, s.y - y);
          if (!s.dead && d < bd) { bd = d; best = s; }
        }
        if (!best) { spawnBurst(st.bursts, x, y, 5, 50, 0.3, 'star'); return; }

        best.dead = true;
        st.combo++;
        st.catches++;
        // streaks climb through multiplier tiers
        const mult = st.combo >= 10 ? 4 : st.combo >= 6 ? 3 : st.combo >= 3 ? 2 : 1;
        if (mult !== st.mult) {
          st.mult = mult;
          g.emit({ type: 'mult', value: mult });
          g.emit({ type: 'flash', text: `${st.combo} in a row · ×${mult} wishes` });
        }
        spawnBurst(st.bursts, best.x, best.y, 18, 170, 0.75, 'fire');
        spawnBurst(st.bursts, best.x, best.y, 10, 80, 1, 'aur');
        g.sound('chime', { notes: [scaleNote(g.key(), st.combo - 1) + 12], vol: 0.09, decay: 1.8, verb: 0.5 });
        g.emit({ type: 'gain', value: mult, x: best.x, y: best.y });
        if (st.catches % 10 === 0) {
          st.eye = { t0: st.time };
          g.emit({ type: 'flash', text: 'the sky is watching' });
          g.sound('void');
        }
      },

      update(g, t, dt) {
        const { W, H, V, P, G } = g, R = S.pal.ranges;
        st.time = t;
        const pace = 1 + Math.min(st.catches, 60) * 0.015;

        if (t > st.next && st.stars.filter(s => !s.dead).length < 4) {
          const right = Math.random() < 0.5;
          const a = right ? rand(0.5, 0.85) : Math.PI - rand(0.5, 0.85);
          const sp = rand(230, 360) * pace * (W < 700 ? 0.75 : 1);
          st.stars.push({
            x: right ? rand(-0.1, 0.6) * W : rand(0.4, 1.1) * W, y: rand(-30, H * 0.15),
            vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, dead: false
          });
          st.next = t + rand(0.7, 1.5) / pace;
        }

        for (let n = st.stars.length - 1; n >= 0; n--) {
          const s = st.stars[n];
          if (s.dead) { st.stars.splice(n, 1); continue; }
          s.x += s.vx * dt; s.y += s.vy * dt;
          if (s.y > hz || s.x < -80 || s.x > W + 80) {
            // fell into the fjord: the streak breaks
            if (s.y > hz) spawnBurst(st.bursts, s.x, hz + 4, 6, 60, 0.6, 'refl');
            if (st.mult > 1) {
              g.emit({ type: 'mult', value: 1 });
              g.emit({ type: 'flash', text: 'streak lost' });
            }
            st.combo = 0;
            st.mult = 1;
            st.stars.splice(n, 1);
            continue;
          }
        }

        boost += (Math.min(1.1, st.combo * 0.14) - boost) * Math.min(1, dt * 2);

        if (st.eye) {
          const e = t - st.eye.t0;
          let o;
          if (e < 0.8) o = e / 0.8;
          else if (e < 6) o = e > 2.8 && e < 3.1 ? 1 - Math.sin((e - 2.8) / 0.3 * Math.PI) : 1;
          else if (e < 6.8) o = 1 - (e - 6) / 0.8;
          else { st.eye = null; o = 0; }
          if (o > 0) drawEye(g, R, o * o * (3 - 2 * o), t);
        }

        // stars burn in front of everything, the eye included: a white-hot head
        // trailing yellow, orange and finally red embers
        for (const s of st.stars) {
          const sp = Math.hypot(s.vx, s.vy), dx = s.vx / sp, dy = s.vy / sp, len = 200;
          g.disc(s.x, s.y, 30, (k, ddx, ddy, d) => g.max(k, 0.5 * (1 - d / 30), pi(R.fire, 0.75)));
          for (let d = 0; d < len; d += 3) {
            const f = 1 - d / len, w = 2 + 8 * f;
            g.disc(s.x - dx * d, s.y - dy * d, w, (k) => {
              V[k] = Math.max(V[k], 0.3 + 0.65 * Math.pow(f, 1.2));
              P[k] = pi(R.fire, f);
              G[k] = 0;
            });
          }
          g.disc(s.x, s.y, 11, (k) => { V[k] = 1; P[k] = pi(R.fire, 1); G[k] = 0; });
          const k = g.at(s.x, s.y);
          if (k >= 0) { V[k] = 1; P[k] = pi(R.fire, 1); G[k] = 9; }
        }

        drawParticles(g, st.bursts, R, dt);
      }
    };

    return S;
  }



  /**
   * #RESUME: a lotus pond from above, fireflies drifting over the pads
   */

  function lotusScene() {

    let pads, flies, ripples, nextRipple, flyScale = 1;

    function makeFly(x, y) {
      return {
        x, y, a: rand(0, TAU), s: rand(10, 28),
        f: rand(0.7, 1.5), ph: rand(0, TAU), gr: rand(28, 46) * flyScale, seed: rand(0, 100)
      };
    }

    const S = {

      bg: '#010806',

      palette: {
        water: [['#020c09', '#06201a', '#0c3a2e', '#1a5a4a'], 8],
        pad: [['#071a0b', '#174a1c', '#2f7a2c', '#6abf4b', '#b8f07a'], 12],
        petal: [['#3a0f2a', '#a83a6e', '#ec8cb8', '#ffd6e8', '#fff6fa'], 12],
        seed: [['#5a4206', '#e6b830', '#fff09a'], 5],
        fly: [['#2a2205', '#c99a12', '#ffd84a', '#fff8d0'], 10],
        ripple: [['#0f3f36', '#5fb8a2', '#bff5e6'], 5],
        frog: [['#0a0824', '#23308f', '#3f6ae0', '#8a5ae8', '#d8c4ff'], 10],
        frogEye: [['#3a2a04', '#ffd23a', '#fffbe0'], 4],
        tongue: [['#5a1030', '#e0507a', '#ffb8cc'], 6]
      },

      init(g) {
        const { W, H } = g, area = W * H, sc = clamp(W / 1500, 0.65, 1.1);
        flyScale = sc;
        pads = []; flies = []; ripples = []; nextRipple = 0;

        const nPads = clamp(Math.round(area / 100000), 6, 22);
        for (let n = 0; n < nPads * 8 && pads.length < nPads; n++) {
          const R = rand(42, 105) * sc, x = rand(0, W), y = rand(0, H);
          if (pads.some(p => Math.hypot(p.x - x, p.y - y) < p.R + R + 10)) continue;
          pads.push(makePad(x, y, R, Math.random() < 0.45));
        }

        const nFlies = clamp(Math.round(area / 32000), 12, 60);
        for (let n = 0; n < nFlies; n++) flies.push(makeFly(rand(0, W), rand(0, H)));
      },

      frame(g, t, dt) {
        const { cols, rows, cw, ch, V, P, G, W, H } = g;
        const R = S.pal.ranges;

        for (let j = 0; j < rows; j++) {
          const y = (j + 0.5) * ch;
          for (let i = 0; i < cols; i++) {
            const x = (i + 0.5) * cw, k = j * cols + i;
            const deep = noise2(x * 0.003, y * 0.003);
            const v = 0.04 + 0.06 * deep + 0.2 * caustic(x, y, t, 0.012);
            V[k] = v; P[k] = pi(R.water, v * 2.6);
          }
        }

        if (t > nextRipple) {
          ripples.push({ x: rand(0, W), y: rand(0, H), age: 0, life: rand(2.5, 4), size: rand(40, 90), str: rand(0.35, 0.55) });
          nextRipple = t + rand(0.6, 1.6);
        }
        drawRipples(g, ripples, R.ripple, dt);

        for (const p of pads) {
          // pads hold still while the frog is hunting, so it never drifts off-screen
          if (g.play) p.rot += p.vr * dt; else movePad(p, g, dt);
          drawPad(g, p, R.pad, R.water);
          if (p.flower) {
            const fx = p.x + Math.cos(p.rot + Math.PI) * p.R * 0.12;
            const fy = p.y + Math.sin(p.rot + Math.PI) * p.R * 0.12;
            drawLotus(g, p.flower, fx, fy, t, R.petal, R.seed);
          }
        }

        const m = g.mouse;
        for (const f of flies) {
          f.a += (noise2(t * 0.4, f.seed) - 0.5) * 3 * dt;
          const mx = m.x - f.x, my = m.y - f.y, md = Math.hypot(mx, my);
          if (md < 220 && md > 30) f.a += angDiff(Math.atan2(my, mx), f.a) * dt * 1.2;
          f.x += Math.cos(f.a) * f.s * dt;
          f.y += Math.sin(f.a) * f.s * dt;
          if (f.x < -30) f.x = W + 30; else if (f.x > W + 30) f.x = -30;
          if (f.y < -30) f.y = H + 30; else if (f.y > H + 30) f.y = -30;

          const b = Math.pow(Math.max(0, Math.sin(t * f.f + f.ph)), 2);
          const s2 = f.gr * f.gr * 0.3;
          g.disc(f.x, f.y, f.gr, (k, dx, dy, d) => {
            const v = (0.1 + 0.8 * b) * Math.exp(-(d * d) / s2);
            if (v > 0.05 && v > V[k] * 0.6) { V[k] = Math.max(V[k], v); P[k] = pi(R.fly, v * 1.2); G[k] = 0; }
          });
          const k = g.at(f.x, f.y);
          if (k >= 0) { V[k] = 0.45 + 0.55 * b; P[k] = pi(R.fly, 0.55 + 0.45 * b); G[k] = 0; }
        }
      }
    };



    /**
     * mini-game "Bug Eater: Night Shift": a ravenous frog on the lily pads.
     * Snap the tongue at fireflies (glowing ones are worth more), hop pad to pad,
     * and every dozen bugs it lets out a burp and grows.
     */

    let frog = null, hunt = null;

    function fireflyGlow(f, t) {
      return Math.pow(Math.max(0, Math.sin(t * f.f + f.ph)), 2);
    }

    function drawFrog(g, R) {
      const { V, P, G } = g;
      const s = frog.size * frog.growth * frog.lift, ca = Math.cos(frog.ang), sa = Math.sin(frog.ang);
      // an ellipse in the frog's own frame: u points where it faces, w across
      const blob = (u, w, ru, rw, fn) => {
        const cx = frog.x + u * ca - w * sa, cy = frog.y + u * sa + w * ca;
        g.disc(cx, cy, Math.max(ru, rw), (k, dx, dy) => {
          const lu = dx * ca + dy * sa, lw = -dx * sa + dy * ca;
          const e = (lu / ru) * (lu / ru) + (lw / rw) * (lw / rw);
          if (e < 1) { G[k] = 0; fn(k, e, lu, lw); }
        });
      };

      // a shadow on the water while it is mid-hop, and a dark outline so it stands off the pad
      if (frog.lift > 1.02) g.disc(frog.x + 10 * frog.lift, frog.y + 16 * frog.lift, s * 0.9, (k) => { V[k] *= 0.3; });
      g.disc(frog.x, frog.y, s * 1.55, (k) => { V[k] *= 0.25; G[k] = 0; });

      for (const side of [-1, 1]) {
        blob(-s * 0.75, side * s * 0.85, s * 0.55, s * 0.3, (k) => { V[k] = 0.5; P[k] = pi(R.frog, 0.45); });
        blob(s * 0.45, side * s * 0.95, s * 0.3, s * 0.2, (k) => { V[k] = 0.5; P[k] = pi(R.frog, 0.45); });
      }
      blob(0, 0, s * 1.15, s, (k, e, lu, lw) => {
        const spot = noise2(lu * 0.15 + 7, lw * 0.15) > 0.66;
        const v = spot ? 0.42 : 0.75 - 0.25 * e;
        V[k] = v; P[k] = pi(R.frog, spot ? 0.25 : 0.5 + 0.35 * (1 - e));
      });
      for (const side of [-1, 1]) {
        blob(s * 0.62, side * s * 0.55, s * 0.36, s * 0.36, (k, e) => {
          V[k] = e < 0.3 ? 0.12 : 0.95; P[k] = e < 0.3 ? R.frog.o : pi(R.frogEye, 0.8);
        });
      }
    }

    function mouth() {
      const s = frog.size * frog.growth;
      return { x: frog.x + Math.cos(frog.ang) * s * 1.05, y: frog.y + Math.sin(frog.ang) * s * 1.05 };
    }

    S.toy = {

      start(g) {
        let best = pads[0], bd = Infinity;
        for (const p of pads) {
          const d = Math.hypot(p.x - g.W / 2, p.y - g.H * 0.7);
          if (d < bd) { bd = d; best = p; }
        }
        frog = { pad: best, x: best.x, y: best.y, ang: -Math.PI / 2, size: 30 * Math.max(flyScale, 0.85), growth: 1, lift: 1, tongue: null, hop: null };
        hunt = { eaten: 0, combo: 0, mult: 1, last: -9, respawn: [], time: 0 };
      },

      stop() { frog = null; hunt = null; },

      down(g, x, y) {
        if (frog.hop) return;
        const reach = 320 * Math.max(flyScale, 0.85) * frog.growth;

        // clicking another pad within a hop's reach jumps to it
        const pad = pads.find(p => p !== frog.pad && Math.hypot(p.x - x, p.y - y) < p.R);
        if (pad && Math.hypot(pad.x - frog.x, pad.y - frog.y) < reach * 1.5 && !frog.tongue) {
          frog.ang = Math.atan2(pad.y - frog.y, pad.x - frog.x);
          frog.hop = { fx: frog.x, fy: frog.y, to: pad, t: 0 };
          g.sound('swoosh', { up: true });
          return;
        }

        if (frog.tongue) return;
        frog.ang = Math.atan2(y - frog.y, x - frog.x);
        frog.tongue = { max: Math.min(Math.hypot(x - frog.x, y - frog.y), reach), len: 0, out: true, caught: [] };
        g.sound('tap');
      },

      update(g, t, dt) {
        const R = S.pal.ranges, { V, P, G } = g;
        hunt.time = t;

        // hop along an arc, landing with a plop and a ripple
        if (frog.hop) {
          const h = frog.hop;
          h.t = Math.min(1, h.t + dt / 0.45);
          frog.x = h.fx + (h.to.x - h.fx) * h.t;
          frog.y = h.fy + (h.to.y - h.fy) * h.t;
          frog.lift = 1 + 0.45 * Math.sin(Math.PI * h.t);
          if (h.t >= 1) {
            frog.pad = h.to;
            frog.hop = null;
            frog.lift = 1;
            ripples.push({ x: frog.x, y: frog.y, age: 0, life: 2.2, size: frog.pad.R * 1.6, str: 0.6 });
            g.sound('plop');
          }
        } else {
          frog.x = frog.pad.x;
          frog.y = frog.pad.y;
          if (!frog.tongue && g.mouse.x > -999) {
            frog.ang += angDiff(Math.atan2(g.mouse.y - frog.y, g.mouse.x - frog.x), frog.ang) * Math.min(1, dt * 6);
          }
        }

        // the tongue: shoot out, grab whatever it touches, reel it in
        const tg = frog.tongue;
        if (tg) {
          if (tg.out) {
            tg.len += tg.max / 0.11 * dt;
            if (tg.len >= tg.max) { tg.len = tg.max; tg.out = false; }
          } else {
            tg.len -= tg.max / 0.16 * dt;
          }
          const m = mouth();
          const tx = m.x + Math.cos(frog.ang) * tg.len, ty = m.y + Math.sin(frog.ang) * tg.len;

          if (tg.out) {
            const grab = 30 * Math.max(flyScale, 0.85) * frog.growth;
            for (let n = flies.length - 1; n >= 0; n--) {
              const f = flies[n];
              if (Math.hypot(f.x - tx, f.y - ty) < grab) {
                tg.caught.push({ lit: fireflyGlow(f, t) > 0.35 });
                flies.splice(n, 1);
                hunt.respawn.push(t + rand(1.5, 4));
              }
            }
          }

          g.line(m.x, m.y, tx, ty, 2.2, (k) => { V[k] = 0.8; P[k] = pi(R.tongue, 0.6); G[k] = 0; });
          g.disc(tx, ty, 5, (k) => { V[k] = 0.95; P[k] = pi(R.tongue, 1); G[k] = 0; });
          for (const c of tg.caught) {
            g.disc(tx, ty, 14, (k, dx, dy, d) => g.max(k, (c.lit ? 0.7 : 0.35) * (1 - d / 14), pi(R.fly, 0.8)));
          }

          if (tg.len <= 0) {
            frog.tongue = null;
            const m = mouth();
            for (const c of tg.caught) {
              hunt.combo = t - hunt.last < 2.5 ? hunt.combo + 1 : 1;
              hunt.last = t;
              hunt.eaten++;
              const mult = hunt.combo >= 4 ? 2 : 1;
              if (mult !== hunt.mult) {
                hunt.mult = mult;
                g.emit({ type: 'mult', value: mult });
                if (mult > 1) g.emit({ type: 'flash', text: 'feeding frenzy · ×2' });
              }
              g.emit({ type: 'gain', value: (c.lit ? 3 : 1) * mult, x: m.x, y: m.y - 20 });
              if (hunt.eaten % 12 === 0 && frog.growth < 1.8) {
                frog.growth *= 1.12;
                g.emit({ type: 'flash', text: 'BURP.' });
                g.sound('gulp', { pitch: 0.45 });
              }
            }
            if (tg.caught.length) g.sound('gulp', { pitch: tg.caught.some(c => c.lit) ? 1.3 : 1 });
          }
        }

        // the frenzy cools off if the frog goes hungry for a moment
        if (hunt.mult > 1 && t - hunt.last > 2.5) {
          hunt.mult = 1;
          hunt.combo = 0;
          g.emit({ type: 'mult', value: 1 });
        }

        // fresh fireflies drift in from the edges to replace the eaten ones
        for (let n = hunt.respawn.length - 1; n >= 0; n--) {
          if (t < hunt.respawn[n]) continue;
          hunt.respawn.splice(n, 1);
          const side = Math.random() * 4 | 0;
          flies.push(makeFly(side === 0 ? -20 : side === 1 ? g.W + 20 : rand(0, g.W), side === 2 ? -20 : side === 3 ? g.H + 20 : rand(0, g.H)));
        }

        drawFrog(g, R);
      }
    };

    return S;
  }



  /**
   * #PORTFOLIO: koi gliding through a dark pond
   */

  const KOI_TYPES = [
    { base: 'white', patch: 'red', thr: 0.52 },                                   // kohaku
    { base: 'gold' },                                                             // ogon
    { base: 'white', patch: 'red', thr: 0.55, ink: 'black', inkThr: 0.8 },        // sanke
    { base: 'orange', patch: 'white', thr: 0.64 },
    { base: 'black', patch: 'red', thr: 0.55, ink: 'white', inkThr: 0.78 },       // showa
    { base: 'white', tancho: true },                                              // tancho
    { base: 'orange' }
  ];

  function koiScene() {

    let fish, pads, ripples, nextRipple, food = [];

    function makeKoi(g, type) {
      const sc = clamp(g.W / 1400, 0.6, 1.1);
      const L = rand(190, 290) * sc, N = 16, seg = L / (N - 1);
      const x = rand(g.W * 0.15, g.W * 0.85), y = rand(g.H * 0.15, g.H * 0.85), h = rand(0, TAU);
      const joints = [];
      for (let k = 0; k < N; k++) joints.push({ x: x - Math.cos(h) * k * seg, y: y - Math.sin(h) * k * seg });
      return {
        L, L0: L, N, seg, h, s0: rand(26, 44), s: 30, phase: rand(0, TAU), seed: rand(0, 100), z: rand(0.72, 1), type,
        joints, rp: joints.map(p => ({ x: p.x, y: p.y })), wid: new Float32Array(N)
      };
    }

    function steer(f, g, t, dt) {
      const { W, H } = g, head = f.joints[0];
      let want = f.h + (noise2(t * 0.1, f.seed) - 0.5) * 1.6;
      let ax = 0, ay = 0, flee = false, hungry = false;
      // soft walls just past the screen edges, so turns can be wide arcs
      const m = f.L * 0.8, e = -f.L * 0.25;
      if (head.x < e + m) ax += (e + m - head.x) / m;
      if (head.x > W - e - m) ax -= (head.x - W + e + m) / m;
      if (head.y < e + m) ay += (e + m - head.y) / m;
      if (head.y > H - e - m) ay -= (head.y - H + e + m) / m;

      // during the feeding game, head for the nearest pellet
      if (g.play && food.length) {
        let best = null, bd = 560;
        for (const p of food) {
          const d = Math.hypot(p.x - head.x, p.y - head.y);
          if (d < bd) { bd = d; best = p; }
        }
        if (best) {
          const pull = 0.6 + 1.8 * (1 - bd / 560);
          ax += (best.x - head.x) / (bd || 1) * pull;
          ay += (best.y - head.y) / (bd || 1) * pull;
          hungry = true;
        }
      }

      for (const o of fish) {
        if (o === f) continue;
        const dx = head.x - o.joints[0].x, dy = head.y - o.joints[0].y, d = Math.hypot(dx, dy);
        if (d > 0 && d < 140) { ax += dx / d * (1 - d / 140) * 0.8; ay += dy / d * (1 - d / 140) * 0.8; }
      }

      // shy of the cursor, except while being fed
      const mdx = head.x - g.mouse.x, mdy = head.y - g.mouse.y, md = Math.hypot(mdx, mdy);
      if (!g.play && md < 150 && md > 0) { ax += mdx / md * 2 * (1 - md / 150); ay += mdy / md * 2 * (1 - md / 150); flee = true; }

      if (ax || ay) want += angDiff(Math.atan2(ay, ax), want) * Math.min(1, Math.hypot(ax, ay));

      // turning circle wider than the body, so koi sweep in arcs instead of folding up
      const turn = f.s / (f.L * (flee ? 0.35 : hungry ? 0.42 : 0.6)) * dt;
      f.h += clamp(angDiff(want, f.h), -turn, turn);
      const sp = f.s0 * (0.7 + 0.6 * noise2(t * 0.2, f.seed + 7)) * (flee ? 2.2 : hungry ? 1.7 : 1);
      f.s += (sp - f.s) * Math.min(1, dt * 1.5);

      head.x += Math.cos(f.h) * f.s * dt;
      head.y += Math.sin(f.h) * f.s * dt;
      for (let k = 1; k < f.N; k++) {
        const a = f.joints[k - 1], b = f.joints[k];
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
        b.x = a.x + dx / d * f.seg; b.y = a.y + dy / d * f.seg;
      }
      f.phase += dt * (2.2 + f.s * 0.07);

      // swimming undulation, growing toward the tail
      const Wm = f.L * 0.13;
      for (let k = 0; k < f.N; k++) {
        const a = f.joints[Math.max(0, k - 1)], b = f.joints[Math.min(f.N - 1, k + 1)];
        let tx = a.x - b.x, ty = a.y - b.y;
        const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
        const u = k / (f.N - 1);
        const off = Math.sin(f.phase - u * 4.2) * f.L * 0.05 * Math.pow(u, 1.4);
        f.rp[k].x = f.joints[k].x - ty * off;
        f.rp[k].y = f.joints[k].y + tx * off;
        // blunt head, broad shoulders, long taper to the tail
        f.wid[k] = Wm * (u < 0.22 ? 0.62 + 0.38 * Math.sin(u / 0.22 * Math.PI / 2) : 0.1 + 0.9 * Math.pow(1 - (u - 0.22) / 0.78, 1.25));
      }
    }

    function fin(g, cx, cy, ang, a, b, z, Rfin) {
      const ca = Math.cos(ang), sa = Math.sin(ang);
      g.disc(cx, cy, a, (k, dx, dy) => {
        const lx = dx * ca + dy * sa, ly = -dx * sa + dy * ca;
        const e = (lx / a) * (lx / a) + (ly / b) * (ly / b);
        if (e < 1) g.max(k, (0.38 + 0.36 * (1 - e)) * z, pi(Rfin, 0.35 + 0.65 * (1 - e)));
      });
    }

    function drawFins(g, f, R) {
      const { rp, N, L, z } = f;

      // pectoral fins, sculling slowly
      const p = rp[3], fa = rp[2], fb = rp[4];
      const dx = fa.x - fb.x, dy = fa.y - fb.y, dl = Math.hypot(dx, dy) || 1;
      const back = Math.atan2(-dy, -dx), nx = -dy / dl, ny = dx / dl;
      const fl = L * 0.18;
      for (const side of [-1, 1]) {
        const flap = 0.55 + 0.35 * Math.sin(f.phase * 0.8 + side);
        const ang = back - side * (Math.PI / 2 - flap);
        const cx = p.x + nx * side * f.wid[3] * 0.8 + Math.cos(ang) * fl * 0.5;
        const cy = p.y + ny * side * f.wid[3] * 0.8 + Math.sin(ang) * fl * 0.5;
        fin(g, cx, cy, ang, fl * 0.5, fl * 0.22, z, R.fin);
      }

      // tail, two flowing lobes
      const tip = rp[N - 1], pre = rp[N - 2];
      const tb = Math.atan2(tip.y - pre.y, tip.x - pre.x), tl = L * 0.24;
      for (const side of [-1, 1]) {
        const ang = tb + side * (0.32 + 0.12 * Math.sin(f.phase * 1.3));
        fin(g, tip.x + Math.cos(ang) * tl * 0.45, tip.y + Math.sin(ang) * tl * 0.45, ang, tl * 0.5, tl * 0.16, z, R.fin);
      }
    }

    function drawBody(g, f, R) {
      const { rp, wid, N, type, z, seed } = f;
      const { cw, ch, cols, rows, V, P, G } = g;
      const pad = f.L * 0.12 + 2;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const p of rp) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
      const i0 = Math.max(0, Math.floor((x0 - pad) / cw)), i1 = Math.min(cols - 1, Math.floor((x1 + pad) / cw));
      const j0 = Math.max(0, Math.floor((y0 - pad) / ch)), j1 = Math.min(rows - 1, Math.floor((y1 + pad) / ch));

      for (let j = j0; j <= j1; j++) {
        const y = (j + 0.5) * ch;
        for (let i = i0; i <= i1; i++) {
          const x = (i + 0.5) * cw;
          let best = 1, bu = 0, bside = 0;
          for (let s = 0; s < N - 1; s++) {
            const a = rp[s], b = rp[s + 1];
            const ex = b.x - a.x, ey = b.y - a.y, px = x - a.x, py = y - a.y;
            const l2 = ex * ex + ey * ey || 1;
            const u = clamp((px * ex + py * ey) / l2, 0, 1);
            const qx = px - ex * u, qy = py - ey * u;
            const r = wid[s] + (wid[s + 1] - wid[s]) * u;
            const q = Math.hypot(qx, qy) / r;
            if (q < best) { best = q; bu = (s + u) / (N - 1); bside = (ex * py - ey * px) > 0 ? q : -q; }
          }
          if (best >= 1) continue;

          // rounded body, with a slightly darker outline for definition
          const v = (best > 0.82 ? 0.6 : 0.97 - 0.4 * best * best) * z;
          let grp = type.base;
          if (type.tancho) {
            if (Math.pow((bu - 0.1) / 0.08, 2) + Math.pow(bside / 0.55, 2) < 1) grp = 'red';
          } else if (type.patch && bu < 0.9 && noise2(bu * 5.5 + seed, bside * 1.3 + seed * 0.7) > type.thr) {
            grp = type.patch;
          }
          if (type.ink && noise2(bu * 9 + seed * 2, bside * 2 + 3) > type.inkThr) grp = type.ink;

          const k = j * cols + i;
          V[k] = v; P[k] = pi(R[grp], v); G[k] = 0;
        }
      }
    }

    const S = {

      bg: '#01050a',

      palette: {
        water: [['#01060c', '#041526', '#082a40', '#0f4560'], 8],
        white: [['#5f6c76', '#d8e2e8', '#ffffff'], 6],
        orange: [['#5a1c04', '#d4561a', '#ff9640', '#ffd49a'], 8],
        red: [['#4a0808', '#c42a1c', '#ff6040'], 6],
        gold: [['#5a3c04', '#e0aa20', '#fff2a8'], 6],
        black: [['#06080c', '#1c222a', '#39424e'], 4],
        fin: [['#2a4a5a', '#8fb8c8', '#f0fbff'], 6],
        pad: [['#061509', '#123d18', '#276a28', '#5aa844', '#9ad86a'], 10],
        petal: [['#3a0f2a', '#a83a6e', '#ec8cb8', '#ffd6e8', '#fff6fa'], 10],
        seed: [['#5a4206', '#e6b830', '#fff09a'], 4],
        ripple: [['#0e3a50', '#5aa8c8', '#cfefff'], 5],
        food: [['#4a2a08', '#c0803a', '#ffd08a'], 5]
      },

      init(g) {
        const { W, H } = g, area = W * H;
        ripples = []; nextRipple = 0; pads = []; food = [];
        const n = clamp(Math.round(area / 210000), 3, 8);
        fish = [];
        for (let k = 0; k < n; k++) fish.push(makeKoi(g, KOI_TYPES[k % KOI_TYPES.length]));
        for (const f of fish) steer(f, g, 0, 0);

        const nPads = clamp(Math.round(area / 380000), 2, 6), sc = clamp(W / 1500, 0.65, 1.1);
        for (let k = 0; k < nPads; k++) {
          const left = k % 2 === 0;
          const x = left ? rand(0, W * 0.18) : rand(W * 0.82, W);
          pads.push(makePad(x, rand(0, H), rand(50, 95) * sc, Math.random() < 0.4));
        }
      },

      frame(g, t, dt) {
        const { cols, rows, cw, ch, V, P, W, H } = g;
        const R = S.pal.ranges;

        for (let j = 0; j < rows; j++) {
          const y = (j + 0.5) * ch;
          for (let i = 0; i < cols; i++) {
            const x = (i + 0.5) * cw, k = j * cols + i;
            const deep = noise2(x * 0.002, y * 0.002);
            const v = 0.04 + 0.08 * deep + 0.2 * caustic(x, y, t, 0.011);
            V[k] = v; P[k] = pi(R.water, v * 2.4);
          }
        }

        for (const f of fish) steer(f, g, t, dt);

        if (t > nextRipple) {
          const f = fish[(Math.random() * fish.length) | 0];
          const src = Math.random() < 0.6 ? f.joints[0] : { x: rand(0, W), y: rand(0, H) };
          ripples.push({ x: src.x, y: src.y, age: 0, life: rand(2.5, 3.5), size: rand(40, 80), str: rand(0.3, 0.45) });
          nextRipple = t + rand(1.4, 3);
        }
        drawRipples(g, ripples, R.ripple, dt);

        // shadows on the pond floor first, so every fish sits above them
        for (const f of fish) {
          const off = 8 + 10 * f.z;
          for (let k = 0; k < f.N; k += 2) {
            g.disc(f.rp[k].x + off, f.rp[k].y + off * 1.4, f.wid[k] * 1.1 + 1, (c) => { V[c] *= 0.3; P[c] = R.water.o; });
          }
        }

        const order = fish.slice().sort((a, b) => a.z - b.z);
        for (const f of order) { drawFins(g, f, R); drawBody(g, f, R); }

        for (const p of pads) {
          movePad(p, g, dt);
          drawPad(g, p, R.pad, R.water);
          if (p.flower) drawLotus(g, p.flower, p.x, p.y, t, R.petal, R.seed);
        }
      }
    };



    /**
     * mini-game "Koi Feast": scatter food and the koi race for it, growing as they eat.
     */

    let feast = null;

    function addRipple(x, y, size, str) {
      ripples.push({ x, y, age: 0, life: 2, size, str });
    }

    S.toy = {

      start() {
        food = [];
        feast = { last: 0 };
      },

      stop() {
        food = [];
        feast = null;
      },

      drop(g, x, y) {
        if (food.length > 45) return;
        food.push({ x, y, age: 0, vx: rand(-4, 4), vy: rand(-4, 4) });
        addRipple(x, y, 34, 0.45);
        g.sound('plop');
      },

      down(g, x, y) {
        feast.last = performance.now();
        this.drop(g, x, y);
      },

      // dragging scatters a trail of pellets
      move(g, x, y, e) {
        if (!e.buttons) return;
        const now = performance.now();
        if (now - feast.last < 110) return;
        feast.last = now;
        this.drop(g, x + rand(-10, 10), y + rand(-10, 10));
      },

      update(g, t, dt) {
        const R = S.pal.ranges, { V, P, G } = g;

        for (const f of fish) {
          const head = f.joints[0], reach = 12 + f.L * 0.06;
          for (let n = food.length - 1; n >= 0; n--) {
            const p = food[n];
            if (Math.hypot(p.x - head.x, p.y - head.y) > reach) continue;
            food.splice(n, 1);
            // eating makes a koi grow, up to half again its size
            f.L = Math.min(f.L0 * 1.5, f.L * 1.035);
            f.seg = f.L / (f.N - 1);
            addRipple(head.x, head.y, 26, 0.35);
            g.sound('gulp', { pitch: 1.6 - f.L / f.L0 * 0.5 });
            g.emit({ type: 'gain', value: 1, x: head.x, y: head.y - 16 });
            break;
          }
        }

        // pellets float, drift and slowly dissolve
        for (let n = food.length - 1; n >= 0; n--) {
          const p = food[n];
          p.age += dt;
          if (p.age > 16) { food.splice(n, 1); continue; }
          p.x += p.vx * dt; p.y += p.vy * dt;
          p.vx *= Math.exp(-0.5 * dt); p.vy *= Math.exp(-0.5 * dt);
          const k = g.at(p.x, p.y);
          if (k < 0) continue;
          const fade = 1 - p.age / 16;
          V[k] = 0.4 + 0.3 * fade; P[k] = pi(R.food, 0.4 + 0.6 * fade); G[k] = 0;
        }
      }
    };

    return S;
  }



  /**
   * #CONTACT: jellyfish pulsing over a reef, light falling from the surface
   */

  function reefScene() {

    let reefTop, corals, snow, jellies, baseJellies = 3;
    const JELLY_GROUPS = ['jp', 'jc', 'ja', 'jp', 'jc'];

    function branch(segs, x, y, a, len, w, depth) {
      const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
      segs.push({ x, y, x2, y2, w, tip: depth === 0 });
      if (depth <= 0) return;
      const n = depth > 2 ? 2 : (Math.random() < 0.6 ? 2 : 1);
      for (let c = 0; c < n; c++) {
        const turn = (n === 1 ? rand(-0.3, 0.3) : (c === 0 ? -1 : 1) * rand(0.25, 0.6));
        branch(segs, x2, y2, a + turn, len * rand(0.65, 0.82), w * 0.72, depth - 1);
      }
    }

    function makeJelly(g, initial) {
      const sc = clamp(g.W / 1500, 0.6, 1.1);
      return {
        x: rand(g.W * 0.06, g.W * 0.94), y: initial ? rand(g.H * 0.1, g.H * 0.75) : g.H + rand(60, 200),
        R: rand(36, 70) * sc, vx: rand(-5, 5), vy: 0, c: 0,
        per: rand(2.8, 4), ph: rand(0, 10), thrust: rand(75, 105),
        grp: JELLY_GROUPS[(Math.random() * JELLY_GROUPS.length) | 0],
        tn: 9 + (Math.random() * 4 | 0), tl: rand(2.2, 3.2), seed: rand(0, 100)
      };
    }

    function drawJelly(g, j, t, Rg) {
      const { V, P, G } = g;
      const c = j.c, bw = j.R * (1 - 0.2 * c), bh = j.R * 0.78 * (1 + 0.16 * c);
      const tilt = 0.22 * Math.sin(t * 0.21 + j.seed) + clamp(j.vx * 0.02, -0.2, 0.2);
      const ca = Math.cos(tilt), sa = Math.sin(tilt);

      // trailing tentacles
      const len = j.R * j.tl;
      for (let n = 0; n < j.tn; n++) {
        const ax = bw * (-0.85 + 1.7 * n / (j.tn - 1));
        const ph = j.seed + n * 1.7;
        for (let s = 0; s < len; s += 3.5) {
          const sf = s / len;
          const lx = ax * (1 - 0.35 * sf) + Math.sin(t * 1.4 + ph - s * 0.045) * (2 + s * 0.11);
          const ly = 3 + s * (0.9 + 0.1 * c);
          const k = g.at(j.x + lx * ca - ly * sa, j.y + lx * sa + ly * ca);
          if (k >= 0) g.max(k, 0.5 * (1 - sf) + 0.12, pi(Rg, 0.3 + 0.45 * (1 - sf)));
        }
      }

      // frilly oral arms
      const arm = j.R * 1.3;
      for (let n = 0; n < 4; n++) {
        const ax = bw * (-0.25 + n / 6);
        for (let s = 0; s < arm; s += 4) {
          const sf = s / arm;
          const lx = ax * (1 - 0.5 * sf) + Math.sin(t * 1.1 + j.seed + n * 2.1 + s * 0.12) * (2 + 4 * sf);
          const ly = 2 + s;
          g.disc(j.x + lx * ca - ly * sa, j.y + lx * sa + ly * ca, 3.5, (k) => g.max(k, 0.62 * (1 - sf * 0.6), pi(Rg, 0.5 + 0.35 * (1 - sf))));
        }
      }

      // translucent bell with a soft glow around it
      g.disc(j.x, j.y - bh * 0.4, Math.max(bw, bh) * 1.7 + 6, (k, dx, dy) => {
        // offset from the rim centre, rotated into the bell's frame
        const oy = dy - bh * 0.4;
        const lx = dx * ca + oy * sa, ly2 = -dx * sa + oy * ca;
        const rim = 2.5 + 2 * Math.sin(lx * 0.3 + t * 2 + j.seed);
        const yy = ly2 < 0 ? ly2 / bh : 0;
        const e = (lx / bw) * (lx / bw) + yy * yy;

        if (e < 1 && ly2 < rim) {
          const f = Math.sqrt(e);
          let v = 0.28 + 0.62 * f * f * f;
          const gx = lx / bw, gy = (ly2 + bh * 0.4) / bh;
          const gr = Math.hypot(gx, gy * 1.3);
          v += 0.4 * Math.exp(-Math.pow((gr - 0.32) / 0.11, 2)) * (0.45 + 0.55 * Math.cos(Math.atan2(gy, gx) * 4 + j.seed));
          if (ly2 > -2) v = Math.max(v, 0.8);
          v = Math.min(1, v + (j.flash || 0) * 0.5);
          V[k] = v; P[k] = pi(Rg, 0.2 + v * 0.8); G[k] = 0;
        } else if (ly2 < rim + 10 + (j.flash || 0) * 20) {
          // soft halo, flaring when the jelly has just been lit
          const ex = Math.sqrt(e) - 1, reach = 0.6 + (j.flash || 0) * 0.9;
          if (ex < reach) g.max(k, (0.24 + (j.flash || 0) * 0.4) * Math.pow(1 - ex / reach, 2), pi(Rg, 0.25 + (j.flash || 0) * 0.5));
        }
      });
    }

    const S = {

      bg: '#010309',

      palette: {
        water: [['#010309', '#03102a', '#072c4e', '#0d4468'], 10],
        ray: [['#08304a', '#1f6a94', '#6cc4e8'], 6],
        snow: [['#2a4a60', '#9ec4d8'], 3],
        rock: [['#05060c', '#141626', '#2a2a40', '#4a4560'], 6],
        coral: [['#2a0610', '#9a2a3a', '#ff6a5a', '#ffc09a'], 10],
        fan: [['#1a0830', '#5e2f96', '#b47cf0', '#e8ccff'], 8],
        kelp: [['#041a0e', '#16502a', '#3e9a40', '#9add6a'], 8],
        anem: [['#0a2a30', '#1fb8b0', '#a8fff0'], 6],
        jp: [['#2a0a2e', '#a04ab8', '#ff9cf0', '#fff0ff'], 12],
        jc: [['#04222e', '#1ea8c8', '#9ef6ff', '#f0ffff'], 12],
        ja: [['#2e1206', '#e07040', '#ffc49a', '#fff4e8'], 12],
        void: [['#000000', '#12040c', '#2a0612', '#8a0e1e', '#ff3a3a'], 12]
      },

      init(g) {
        const { W, H, cols, cw } = g, area = W * H, sc = clamp(W / 1500, 0.6, 1.1);
        reefTop = new Float32Array(cols);
        for (let i = 0; i < cols; i++) {
          const x = (i + 0.5) * cw;
          reefTop[i] = H * (0.9 - 0.11 * fbm(x * 0.004, 2.2));
        }
        const topAt = (x) => reefTop[clamp(Math.floor(x / cw), 0, cols - 1)];

        corals = [];
        for (let x = rand(10, 40); x < W; x += rand(55, 120) * sc) {
          const r = Math.random(), base = topAt(x) + 3, ph = rand(0, TAU);
          if (r < 0.22) corals.push({ kind: 'kelp', x, y: base, h: rand(0.3, 0.6) * H, ph });
          else if (r < 0.47) {
            const segs = [];
            branch(segs, 0, 0, -Math.PI / 2 + rand(-0.25, 0.25), rand(30, 46) * sc, 6, 4);
            corals.push({ kind: 'branch', x, y: base, segs, ph });
          }
          else if (r < 0.67) corals.push({ kind: 'fan', x, y: base, R: rand(60, 105) * sc, ph });
          else if (r < 0.83) corals.push({ kind: 'anem', x, y: base, n: 12 + (Math.random() * 5 | 0), len: rand(30, 46) * sc, ph });
          else corals.push({ kind: 'brain', x, y: base, rx: rand(34, 56) * sc, ry: rand(20, 32) * sc, ph });
        }
        // kelp sways behind everything else
        corals.sort((a, b) => (b.kind === 'kelp') - (a.kind === 'kelp'));

        snow = [];
        const ns = clamp(Math.round(area / 12000), 40, 200);
        for (let n = 0; n < ns; n++) snow.push({ x: rand(0, W), y: rand(0, H), vy: rand(5, 14), ph: rand(0, TAU), b: rand(0.15, 0.32) });

        jellies = [];
        baseJellies = clamp(Math.round(area / 280000), 3, 7);
        for (let n = 0; n < baseJellies; n++) jellies.push(makeJelly(g, true));
      },

      frame(g, t, dt) {
        const { cols, rows, cw, ch, V, P, W, H } = g;
        const R = S.pal.ranges;

        for (let j = 0; j < rows; j++) {
          const y = (j + 0.5) * ch, depth = y / H;
          for (let i = 0; i < cols; i++) {
            const x = (i + 0.5) * cw, k = j * cols + i;

            if (y > reefTop[i]) {
              const dd = y - reefTop[i];
              let v = 0.06 + 0.14 * fbm(x * 0.03, y * 0.04) + 0.12 * caustic(x, y, t, 0.02) * Math.max(0, 1 - dd / 40);
              if (dd < ch) v += 0.22;
              V[k] = v; P[k] = pi(R.rock, v * 2.2);
              continue;
            }

            let v = 0.03 + 0.06 * (1 - depth) + 0.03 * noise2(x * 0.01, y * 0.01 + t * 0.05);
            let p = pi(R.water, (1 - depth) * 0.85 + v);
            // slanted shafts of light that fade with depth
            const r = noise2((x + y * 0.5) * 0.009 + t * 0.03, t * 0.05);
            const ray = Math.pow(Math.max(0, (r - 0.55) / 0.45), 2) * Math.pow(1 - depth, 1.2) * 0.38;
            if (ray > v) { v = ray; p = pi(R.ray, ray * 2.2); }
            V[k] = v; P[k] = p;
          }
        }

        for (const c of corals) {
          const sway = Math.sin(t * 0.6 + c.ph);

          if (c.kind === 'kelp') {
            let side = 1, px = c.x, py = c.y;
            for (let s = 0; s <= c.h; s += 6) {
              const sf = s / c.h;
              const x = c.x + Math.sin(t * 0.55 + c.ph + s * 0.011) * s * 0.13 + Math.sin(t * 1.1 + s * 0.035 + c.ph) * 4 * sf;
              const y = c.y - s;
              g.line(px, py, x, y, 2.5, (k) => g.max(k, 0.5 + 0.1 * sf, pi(R.kelp, 0.4 + 0.2 * sf)));
              if (s % 36 === 0 && s > 10) {
                // a blade curving out and up from the stalk
                const la = -Math.PI / 2 + side * (0.75 + 0.2 * Math.sin(t * 0.8 + s * 0.02 + c.ph));
                const bl = 26 * (1 - sf * 0.4);
                g.line(x, y, x + Math.cos(la) * bl, y + Math.sin(la) * bl, 3.2, (k, f) => g.max(k, 0.38 + 0.2 * f, pi(R.kelp, 0.45 + 0.5 * f)));
                side = -side;
              }
              px = x; py = y;
            }

          } else if (c.kind === 'branch') {
            for (const s of c.segs) {
              const x0 = c.x + s.x - sway * s.y * 0.04, x1 = c.x + s.x2 - sway * s.y2 * 0.04;
              g.line(x0, c.y + s.y, x1, c.y + s.y2, s.w, (k, f) => {
                const v = s.tip && f > 0.75 ? 0.8 : 0.42 + 0.12 * f;
                g.max(k, v, pi(R.coral, v));
              });
            }

          } else if (c.kind === 'fan') {
            g.disc(c.x, c.y, c.R, (k, dx, dy, d) => {
              if (dy > 0 || d < 4) return;
              const sx = dx - sway * (d / c.R) * 8;
              const a = Math.atan2(dy, sx) + Math.PI / 2;
              if (Math.abs(a) > 0.95) return;
              const rib = Math.abs(Math.sin(a * 14)) < 0.22, ring = Math.abs(Math.sin(d * 0.35)) < 0.25;
              let v = rib ? 0.5 : ring ? 0.4 : 0.1;
              if (d > c.R - 4) v = 0.55;
              g.max(k, v, pi(R.fan, v * 1.3));
            });

          } else if (c.kind === 'anem') {
            g.disc(c.x, c.y, 9, (k) => g.max(k, 0.35, pi(R.anem, 0.3)));
            for (let n = 0; n < c.n; n++) {
              const base = -Math.PI / 2 + (n / (c.n - 1) - 0.5) * 2.2;
              let x = c.x, y = c.y - 4;
              for (let s = 0; s < c.len; s += 3) {
                const a = base + Math.sin(t * 1.3 + c.ph + n * 0.7 + s * 0.15) * 0.35 * (s / c.len);
                x += Math.cos(a) * 3; y += Math.sin(a) * 3;
                const k = g.at(x, y);
                if (k >= 0) g.max(k, s > c.len - 4 ? 0.85 : 0.45, pi(R.anem, 0.3 + 0.7 * s / c.len));
              }
            }

          } else {
            g.disc(c.x, c.y, c.rx, (k, dx, dy) => {
              if (dy > 2) return;
              const e = (dx / c.rx) * (dx / c.rx) + (dy / c.ry) * (dy / c.ry);
              if (e > 1) return;
              const v = 0.22 + 0.42 * Math.abs(Math.sin(noise2((c.x + dx) * 0.06, (c.y + dy) * 0.06) * 14)) * (1 - e * 0.4);
              g.max(k, v, pi(R.fan, v * 1.2));
            });
          }
        }

        for (const s of snow) {
          s.y += s.vy * dt;
          s.x += Math.sin(t * 0.5 + s.ph) * 4 * dt;
          if (s.y > H + 4) { s.y = -4; s.x = rand(0, W); }
          const k = g.at(s.x, s.y);
          if (k >= 0 && V[k] < s.b) g.max(k, s.b, pi(R.snow, s.b * 2));
        }

        for (let n = 0; n < jellies.length; n++) {
          const j = jellies[n];
          const cp = ((t + j.ph) / j.per) % 1;
          j.c = cp < 0.32 ? Math.sin(cp / 0.32 * Math.PI) : 0;
          j.vy += (-j.thrust * j.c + 9) * dt;
          j.vy *= Math.exp(-1.6 * dt);
          j.vx += (noise2(t * 0.1, j.seed) - 0.5) * 6 * dt;
          j.vx = clamp(j.vx, -10, 10);
          j.x += j.vx * dt; j.y += j.vy * dt;
          if (j.flash) j.flash *= Math.exp(-2.2 * dt);
          if (j.y < -j.R * (j.tl + 1.5) || j.x < -j.R * 3 || j.x > W + j.R * 3) {
            // the extra jellies from the game drift away rather than respawning
            if (!g.play && jellies.length > baseJellies) { jellies.splice(n, 1); n--; continue; }
            jellies[n] = makeJelly(g, false);
          }
          drawJelly(g, j, t, j.void ? R.void : R[j.grp]);
        }
      }
    };

    /**
     * mini-game "Glow Chain": one spark per round. A pulse of light spreads from the click;
     * every jellyfish it touches lights up, sings the next note and pulses in turn.
     * Void jellies swallow the light and end that branch of the chain.
     */

    let chain = null;

    function newRound() {
      for (const j of jellies) { j.spent = false; j.void = false; }
      // a couple of void jellies lurk in every round once the reef is busy enough
      const pool = jellies.slice().sort(() => Math.random() - 0.5);
      for (let n = 0; n < Math.min(2, Math.floor(jellies.length / 5)); n++) pool[n].void = true;
    }

    function addRing(x, y, max, grp, delay) {
      chain.pending.push({ x, y, max, grp, at: chain.time + delay });
    }

    S.toy = {

      start(g) {
        const target = clamp(Math.round(g.W * g.H / 58000), 10, 22);
        while (jellies.length < target) jellies.push(makeJelly(g, true));
        chain = { rings: [], pending: [], active: false, count: 0, points: 0, cool: 0, time: 0, voidSeen: false };
        newRound();
      },

      stop() {
        for (const j of jellies) { j.void = false; j.spent = false; }
        chain = null;
      },

      down(g, x, y) {
        if (chain.active || chain.cool > 0) return;
        chain.active = true;
        chain.count = 0;
        chain.points = 0;
        addRing(x, y, 150 * clamp(g.W / 1500, 0.85, 1.15), 'jc', 0);
        g.sound('chime', { notes: [g.key()[0] + 12], vol: 0.06, decay: 1 });
      },

      update(g, t, dt) {
        const R = S.pal.ranges, sc = clamp(g.W / 1500, 0.85, 1.15);
        chain.time = t;
        chain.cool -= dt;

        for (let n = chain.pending.length - 1; n >= 0; n--) {
          const p = chain.pending[n];
          if (t < p.at) continue;
          chain.pending.splice(n, 1);
          chain.rings.push({ x: p.x, y: p.y, max: p.max, grp: p.grp, age: 0, dur: 0.85 });
        }

        for (let n = chain.rings.length - 1; n >= 0; n--) {
          const ring = chain.rings[n];
          ring.age += dt;
          if (ring.age > ring.dur) { chain.rings.splice(n, 1); continue; }
          const f = ring.age / ring.dur, r = ring.max * (1 - Math.pow(1 - f, 3));

          g.disc(ring.x, ring.y, r + 5, (k, dx, dy, d) => {
            const band = 1 - Math.abs(d - r) / 5;
            if (band > 0) g.max(k, (0.85 * (1 - f) + 0.1) * band, pi(R[ring.grp], 0.5 + 0.5 * (1 - f)));
          });

          // light reaching a jellyfish's bell sets it off
          for (const j of jellies) {
            if (j.spent) continue;
            const bx = j.x, by = j.y - j.R * 0.35;
            if (Math.hypot(bx - ring.x, by - ring.y) > r + j.R * 0.5) continue;
            j.spent = true;
            j.flash = 1;
            if (j.void) {
              g.sound('void');
              if (!chain.voidSeen) { chain.voidSeen = true; g.emit({ type: 'flash', text: 'the void hungers' }); }
              continue;
            }
            chain.count++;
            // each link in the chain is worth more than the last
            chain.points += chain.count;
            g.emit({ type: 'gain', value: chain.count, x: bx, y: by - j.R * 0.6 });
            j.vy -= 30;
            g.sound('chime', { notes: [scaleNote(g.key(), chain.count - 1) + 12], vol: 0.075, decay: 1.6, verb: 0.55 });
            // reach tuned so each pulse finds about two neighbours: chains run, but aim still matters
            addRing(bx, by, (150 + j.R * 1.5) * sc, j.grp, 0.12);
          }
        }

        // the round ends once the last ring fades
        if (chain.active && !chain.rings.length && !chain.pending.length) {
          chain.active = false;
          chain.cool = 0.9;
          const n = chain.count, pts = chain.points;
          g.emit({ type: 'flash', text: n >= 10 ? `chain of ${n} · the reef sings · +${pts}` : n >= 5 ? `chain of ${n} · lovely · +${pts}` : n ? `chain of ${n} · +${pts}` : 'nothing caught the light' });
          setTimeout(() => { if (chain) newRound(); }, 600);
        }
      }
    };

    return S;
  }



  /**
   * engine: sizing, glyph atlas, scene switching and the frame loop
   */

  class AsciiBackground {

    constructor(canvas, factories) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.factories = factories;
      this.scenes = {};
      this.grid = new Grid();
      this.mouse = { x: -9999, y: -9999 };
      this.grid.mouse = this.mouse;
      this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.last = 0;
      this.play = false;
      this.looping = false;
      this.loop = this.loop.bind(this);

      // what the mini-games can reach: the HUD, the sound effects and the music's key
      this.grid.play = false;
      this.grid.touch = window.matchMedia('(pointer: coarse)').matches;
      this.grid.emit = (e) => { if (this.onToy) this.onToy(e); };
      this.grid.sound = (name, opts) => { if (window.portfolioMusic) window.portfolioMusic.sfx(name, opts); };
      this.grid.key = () => window.portfolioMusic ? window.portfolioMusic.keyNotes(this.name) : [62, 69, 73, 76, 78];

      this.resize();

      window.addEventListener('resize', () => {
        clearTimeout(this.resizeTimer);
        this.resizeTimer = setTimeout(() => this.resize(), 150);
      });
      window.addEventListener('pointermove', (e) => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; }, { passive: true });
      document.addEventListener('pointerleave', () => { this.mouse.x = this.mouse.y = -9999; });

      // the canvas only receives pointers while a scene is being played
      const toy = (type) => (e) => {
        const t = this.play && this.scene && this.scene.toy;
        if (!t || !t[type]) return;
        this.mouse.x = e.clientX; this.mouse.y = e.clientY;
        if (type === 'down') {
          try { this.canvas.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone */ }
        }
        t[type](this.grid, e.clientX, e.clientY, e);
      };
      this.canvas.addEventListener('pointerdown', toy('down'));
      this.canvas.addEventListener('pointermove', toy('move'));
      this.canvas.addEventListener('pointerup', toy('up'));

      this.startLoop();
    }

    startLoop() {
      if (this.looping || (this.reduced && !this.play)) return;
      this.looping = true;
      requestAnimationFrame(this.loop);
    }

    // the scene's mini-game: info for the HUD, and switching it on or off
    toyInfo(name) {
      return TOYS[name];
    }

    setPlay(on) {
      this.play = this.grid.play = on;
      const s = this.scene;
      if (s && s.toy) s.toy[on ? 'start' : 'stop'](this.grid);
      this.startLoop();
    }

    resize() {
      const rect = this.canvas.getBoundingClientRect();
      const W = Math.max(1, Math.round(rect.width)), H = Math.max(1, Math.round(rect.height));
      if (W === this.W && H === this.H) return;
      this.W = W; this.H = H;

      const dpr = this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const fs = W < 600 ? 9 : W < 1000 ? 10 : W < 1600 ? 11 : 12;
      this.font = `${fs * dpr}px ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace`;
      this.ctx.font = this.font;
      this.cwD = Math.max(1, Math.round(this.ctx.measureText('M').width));
      this.chD = Math.round(fs * 1.3 * dpr);

      this.canvas.width = Math.ceil(W * dpr);
      this.canvas.height = Math.ceil(H * dpr);
      this.grid.setup(W, H, this.cwD / dpr, this.chD / dpr);

      for (const name in this.scenes) this.scenes[name].ready = false;
      if (this.name) this.activate(this.name);
      if (this.reduced && this.scene) this.draw();
    }

    // glyphs pre-rendered on the scene's background, kept as raw pixels for fast copying
    buildAtlas(scene) {
      const { colors } = scene.pal, cw = this.cwD, ch = this.chD;
      const atlas = document.createElement('canvas');
      atlas.width = cw * GLYPHS.length;
      atlas.height = ch * colors.length;
      const c = atlas.getContext('2d');
      c.fillStyle = scene.bg;
      c.fillRect(0, 0, atlas.width, atlas.height);
      c.font = this.font;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      colors.forEach((col, p) => {
        c.fillStyle = col;
        for (let g = 1; g < GLYPHS.length; g++) c.fillText(GLYPHS[g], g * cw + cw / 2, p * ch + ch / 2 + 0.5);
      });
      scene.atlasPx = new Uint32Array(c.getImageData(0, 0, atlas.width, atlas.height).data.buffer);
      scene.atlasW = atlas.width;
      scene.bg32 = scene.atlasPx[0];
    }

    activate(name) {
      let s = this.scenes[name];
      if (!s) {
        s = this.scenes[name] = this.factories[name]();
        s.pal = buildPalette(s.palette);
      }
      if (!s.ready) {
        this.grid.clear();
        s.init(this.grid);
        this.buildAtlas(s);
        s.ready = true;
        if (this.play && s.toy) s.toy.start(this.grid);
      }
      this.name = name;
      this.scene = s;
    }

    setScene(name) {
      if (!this.factories[name] || name === this.target) return;
      this.target = name;

      if (!this.scene) {
        this.activate(name);
        if (this.reduced) this.draw();
        return;
      }

      // fade out, swap, fade back in
      this.canvas.classList.add('is-fading');
      clearTimeout(this.fadeTimer);
      this.fadeTimer = setTimeout(() => {
        this.activate(this.target);
        if (this.reduced) this.draw();
        this.canvas.classList.remove('is-fading');
      }, 420);
    }

    loop(now) {
      if (this.reduced && !this.play) { this.looping = false; return; }
      requestAnimationFrame(this.loop);
      if (now - this.last < 1000 / FPS) return;
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      if (this.scene) this.draw(now / 1000, dt);
    }

    draw(t = 6, dt = 0) {
      const g = this.grid, s = this.scene;
      g.clear();
      s.frame(g, t, dt);
      if (this.play && s.toy) s.toy.update(g, t, dt);

      const cw = this.cwD, ch = this.chD;
      const Wd = this.canvas.width, Hd = this.canvas.height;
      if (!this.image || this.image.width !== Wd || this.image.height !== Hd) {
        this.image = this.ctx.createImageData(Wd, Hd);
        this.buf = new Uint32Array(this.image.data.buffer);
      }
      const buf = this.buf, src = s.atlasPx, aw = s.atlasW;
      const { V, P, G, cols, rows } = g;
      buf.fill(s.bg32);

      for (let j = 0; j < rows; j++) {
        const y0 = j * ch, hh = Math.min(ch, Hd - y0);
        for (let i = 0; i < cols; i++) {
          const k = j * cols + i;
          let gl = G[k];
          if (!gl) {
            const v = V[k];
            if (v < 0.035) continue;
            gl = 1 + Math.min(RL - 2, (v * (RL - 1)) | 0);
          }
          const x0 = i * cw, ww = Math.min(cw, Wd - x0);
          let so = P[k] * ch * aw + gl * cw, d = y0 * Wd + x0;
          for (let r = 0; r < hh; r++, so += aw, d += Wd) {
            for (let c = 0; c < ww; c++) buf[d + c] = src[so + c];
          }
        }
      }

      this.ctx.putImageData(this.image, 0, 0);
    }

  }



  const canvas = document.querySelector('[data-ascii-bg]');
  if (!canvas || !canvas.getContext) return;

  const background = new AsciiBackground(canvas, {
    about: auroraScene,
    resume: lotusScene,
    portfolio: koiScene,
    contact: reefScene
  });

  const active = document.querySelector('article.active[data-page]');
  background.setScene(active ? active.dataset.page : 'about');

  window.asciiBackground = background;

})();
