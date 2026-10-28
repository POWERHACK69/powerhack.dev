'use strict';

/**
 * Ambient soundtrack: one piece per page, crossfaded when the page changes.
 *
 * The pieces are pre-rendered audio files (assets/audio): Opus in WebM, with AAC as a fallback
 * for browsers that can't decode Opus. They are fetched and decoded in the background once the
 * page has loaded, so switching music on is instant. Interaction sounds are still synthesised
 * live, pitched from each piece's opening chord so every click lands in key.
 */
(function () {

  const MUSIC_VOLUME = 0.34; // master level for the soundtrack, kept well under the page
  const SFX_VOLUME = 0.45;   // interaction sounds, on their own bus beside the music
  const FADE = 3.2;          // crossfade length in seconds
  const STORAGE_KEY = 'portfolio-music';
  const AUDIO_DIR = './assets/audio/';



  // notation helpers

  const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  // 'F#5' -> 78
  function midi(name) {
    const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
    return 12 * (+m[3] + 1) + NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  }

  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const chord = (s) => s.trim().split(/\s+/).map(midi);
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];



  /**
   * the pieces, one per page. `key` is each piece's opening chord, which the sound effects
   * and the background mini-games pitch themselves from.
   */

  const SONGS = {
    about: { title: 'Aurora Fjord', file: 'aurora-fjord', key: 'D3 A3 C#4 E4 F#4' },
    resume: { title: 'Lotus & Fireflies', file: 'lotus-and-fireflies', key: 'A3 C4 E4 G4 B4' },
    portfolio: { title: 'Koi Pond', file: 'koi-pond', key: 'D3 A3 C4 E4 F4' },
    contact: { title: 'Jellyfish Reef', file: 'jellyfish-reef', key: 'E3 B3 D#4 F#4 G#4' }
  };

  // Opus is smaller for the same quality; Safari versions without it get AAC
  const FORMATS = new Audio().canPlayType('audio/webm; codecs="opus"') ? ['webm', 'm4a'] : ['m4a'];

  // fetch and decode one piece, falling back to the next format if a browser can't decode the first.
  // An offline context decodes without needing a click, and its buffers play in any context.
  async function fetchLoop(file) {
    let lastError;
    for (const ext of FORMATS) {
      try {
        const res = await fetch(AUDIO_DIR + file + '.' + ext);
        if (!res.ok) throw new Error(`${res.status} for ${file}.${ext}`);
        return await new OfflineAudioContext(2, 1, 48000).decodeAudioData(await res.arrayBuffer());
      } catch (e) { lastError = e; }
    }
    throw lastError;
  }



  /**
   * shared audio building blocks
   */

  function osc(c, type, freq, t, stop) {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.start(t);
    o.stop(stop);
    return o;
  }

  function gainAt(c, t, v) {
    const g = c.createGain();
    g.gain.setValueAtTime(v, t);
    return g;
  }

  // quick attack, exponential decay
  function strike(g, t, peak, decay) {
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  }

  // a long, soft hall built from decaying stereo noise
  function makeReverb(c, seconds) {
    const verb = c.createConvolver();
    const len = Math.floor(c.sampleRate * seconds), ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let prev = 0;
      for (let i = 0; i < len; i++) {
        prev = prev * 0.6 + (Math.random() * 2 - 1) * 0.4;
        d[i] = prev * Math.pow(1 - i / len, 3.2);
      }
    }
    verb.buffer = ir;
    return verb;
  }

  function makeNoise(c) {
    const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }



  /**
   * interaction sounds: short synthesised blips, taps and chimes. Pitches come
   * from the playing piece's opening chord, so every click lands in key.
   * Each takes (music, options) and plays immediately on music.sfxBus.
   */

  const SFX = {

    // the faintest glassy tick when the pointer lands on something interactive
    hover(m) {
      const c = m.ctx, t = c.currentTime, g = c.createGain();
      strike(g, t, 0.17, 0.06);
      osc(c, 'sine', mtof(pick(m.keyNotes()) + 36), t, t + 0.08).connect(g).connect(m.sfxOut(rand(-0.3, 0.3), 0.1));
    },

    // a soft wooden tap for buttons and links
    tap(m) {
      const c = m.ctx, t = c.currentTime, out = m.sfxOut(rand(-0.15, 0.15), 0.12);
      const f = mtof(pick(m.keyNotes()) + 24), g = c.createGain();
      strike(g, t, 0.3, 0.16);
      const o = osc(c, 'triangle', f, t, t + 0.2);
      o.frequency.exponentialRampToValueAtTime(f * 0.7, t + 0.08);
      o.connect(g).connect(out);

      // tiny transient on top for a crisp edge
      const n = c.createBufferSource(), hp = c.createBiquadFilter(), ng = c.createGain();
      n.buffer = m.noise;
      hp.type = 'highpass';
      hp.frequency.value = 2500;
      strike(ng, t, 0.12, 0.025);
      n.connect(hp).connect(ng).connect(out);
      n.start(t);
      n.stop(t + 0.04);
    },

    // filters and dropdowns: a quick two-step blip
    select(m) {
      const c = m.ctx, t = c.currentTime, notes = m.keyNotes(), out = m.sfxOut(0, 0.15);
      [notes[1], notes[3]].forEach((n, k) => {
        const g = c.createGain(), at = t + k * 0.055;
        strike(g, at, 0.13, 0.12);
        osc(c, 'sine', mtof(n + 24), at, at + 0.15).connect(g).connect(out);
      });
    },

    // little bell chime; `notes` are MIDI numbers played as a quick arpeggio
    chime(m, { notes, gap = 0.09, vol = 0.06, decay = 1.3, verb = 0.35 }) {
      const c = m.ctx, t = c.currentTime;
      notes.forEach((n, k) => {
        const at = t + k * gap, f = mtof(n), out = m.sfxOut((k / Math.max(1, notes.length - 1) - 0.5) * 0.5, verb);
        for (const [ratio, amp, dk] of [[1, 1, 1], [2.76, 0.28, 0.3], [5.4, 0.08, 0.12]]) {
          const g = c.createGain();
          strike(g, at, vol * amp, decay * dk);
          osc(c, 'sine', f * ratio, at, at + decay * dk + 0.05).connect(g).connect(out);
        }
      });
    },

    // the frog (and the koi) swallowing: a quick downward gloop; pitch < 1 for a burp
    gulp(m, { pitch = 1 }) {
      const c = m.ctx, t = c.currentTime, g = c.createGain(), dur = 0.16 / Math.sqrt(pitch);
      strike(g, t, 0.3, dur);
      const o = osc(c, 'sine', 420 * pitch, t, t + dur + 0.05);
      o.frequency.exponentialRampToValueAtTime(130 * pitch, t + dur * 0.8);
      o.connect(g).connect(m.sfxOut(rand(-0.2, 0.2), 0.1));
    },

    // something small landing on water
    plop(m) {
      const c = m.ctx, t = c.currentTime, g = c.createGain();
      strike(g, t, 0.24, 0.13);
      const o = osc(c, 'sine', 950, t, t + 0.16);
      o.frequency.exponentialRampToValueAtTime(320, t + 0.07);
      o.connect(g).connect(m.sfxOut(rand(-0.3, 0.3), 0.3));
    },

    // something vast and low, for the void and the watching sky
    void(m) {
      const c = m.ctx, t = c.currentTime, out = m.sfxOut(0, 0.6), g = c.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.28, t + 0.15);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
      for (const [f, type] of [[55, 'sine'], [58.3, 'sine'], [110, 'triangle']]) {
        osc(c, type, f, t, t + 1.9).connect(gainAt(c, t, type === 'sine' ? 1 : 0.25)).connect(g);
      }
      g.connect(out);
    },

    // airy swoosh for the sidebar opening (up) or closing (down)
    swoosh(m, { up }) {
      const c = m.ctx, t = c.currentTime, dur = 0.32;
      const n = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain();
      n.buffer = m.noise;
      bp.type = 'bandpass';
      bp.Q.value = 1.2;
      bp.frequency.setValueAtTime(up ? 450 : 2400, t);
      bp.frequency.exponentialRampToValueAtTime(up ? 2400 : 450, t + dur);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.17, t + dur * 0.4);
      g.gain.linearRampToValueAtTime(0, t + dur);
      n.connect(bp).connect(g).connect(m.sfxOut(0, 0.25));
      n.start(t);
      n.stop(t + dur + 0.05);
    }

  };

  // what makes which sound
  const HOVER_TARGETS = '.navbar-link, .service-item, .project-item > a, .social-link, .contact-link, .filter-item button, .select-item button, .skill-label, .form-btn, .info_more-btn, .music-toggle, .service-item-title a';



  /**
   * engine: audio graph, transport and the on-page toggle
   */

  class Music {

    constructor(button) {
      this.button = button;
      this.label = button.querySelector('[data-music-label]');
      this.enabled = false;
      this.song = null;
      this.current = null;     // { name, src, gain } of the loop that is playing
      this.loops = new Map();  // decoded loops by song name (promises)
      this.gamesOpened = false;
      this.optOut = false;

      button.addEventListener('click', () => this.toggle());
      this.bindSfx();

      document.addEventListener('visibilitychange', () => {
        if (!this.ctx || !this.enabled) return;
        if (document.hidden) this.ctx.suspend(); else this.ctx.resume();
      });

      // a visitor who left music on last time gets it back on their first interaction
      if (this.readPref()) {
        const resume = (e) => {
          if (e.target.closest && e.target.closest('[data-music-toggle]')) return;
          if (!this.enabled) this.enable();
        };
        document.addEventListener('pointerdown', resume, { once: true });
        document.addEventListener('keydown', resume, { once: true });
      }

      this.render();
    }

    readPref() {
      try { return localStorage.getItem(STORAGE_KEY) === 'on'; } catch (e) { return false; }
    }

    writePref(on) {
      try { localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off'); } catch (e) { /* storage unavailable */ }
    }

    setup() {
      // 'balanced' trades a few milliseconds of latency for steadier audio on slower devices
      const AC = window.AudioContext || window.webkitAudioContext;
      let c;
      try { c = new AC({ latencyHint: 'balanced' }); } catch (e) { c = new AC(); }
      this.ctx = c;

      // the music loops arrive pre-mixed; a gentle compressor and the master level shape them
      this.master = c.createGain();
      this.master.gain.value = 0;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 3;
      comp.attack.value = 0.02;
      comp.release.value = 0.4;
      this.musicBus = c.createGain();
      this.musicBus.connect(comp).connect(this.master).connect(c.destination);

      // sound effects skip the music's fades and level, with a light compressor of their own
      const sfxComp = c.createDynamicsCompressor();
      sfxComp.threshold.value = -20;
      sfxComp.ratio.value = 4;
      this.sfxBus = c.createGain();
      this.sfxBus.gain.value = SFX_VOLUME;
      this.sfxBus.connect(sfxComp).connect(c.destination);

      // a short, cheap room for the sound effects
      this.reverb = makeReverb(c, 1.6);
      this.reverb.connect(gainAt(c, 0, 0.5)).connect(this.sfxBus);

      this.noise = makeNoise(c);
    }

    // the decoded loop for a piece, fetching it the first time and keeping it after
    loadLoop(name) {
      let p = this.loops.get(name);
      if (!p) {
        p = fetchLoop(SONGS[name].file);
        // a failed render is forgotten so the next request tries again
        p.catch(() => { if (this.loops.get(name) === p) this.loops.delete(name); });
        this.loops.set(name, p);
      }
      return p;
    }

    // load every piece in the background once the page has settled, the current page's first,
    // one at a time so it never competes with the page; switching music on or changing page is
    // then instant. It needs no click and makes no sound. About 1.9MB to download.
    preload() {
      const order = [this.song, ...Object.keys(SONGS).filter((n) => n !== this.song)];
      order.reduce((prev, name) => prev.then(() => this.loadLoop(name)).catch(() => {}), Promise.resolve());
    }

    fadeOut(track, seconds) {
      const now = this.ctx.currentTime, g = track.gain.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(0, now + seconds);
      setTimeout(() => {
        track.src.stop();
        track.gain.disconnect();
      }, (seconds + 0.2) * 1000);
    }

    // sound effects follow the sound toggle, so nobody gets surprise noises
    sfx(name, opts) {
      if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
      SFX[name](this, opts || {});
    }

    sfxOut(pan, verb) {
      const c = this.ctx, p = c.createStereoPanner();
      p.pan.value = pan;
      p.connect(this.sfxBus);
      if (verb) p.connect(gainAt(c, 0, verb)).connect(this.reverb);
      return p;
    }

    // pitches for UI sounds: the opening chord of a piece (the current one by default)
    keyNotes(song) {
      return chord(SONGS[song || this.song].key);
    }

    bindSfx() {
      const finePointer = window.matchMedia('(hover: hover)').matches;
      let lastHover = 0;

      if (finePointer) {
        document.addEventListener('pointerover', (e) => {
          const el = e.target.closest(HOVER_TARGETS);
          if (!el || el.contains(e.relatedTarget) || e.pointerType !== 'mouse') return;
          const now = performance.now();
          if (now - lastHover < 70) return;
          lastHover = now;
          this.sfx('hover');
        });
      }

      document.addEventListener('click', (e) => {
        const el = e.target.closest('a, button, .skill-label');
        if (!el || el.disabled || el.closest('[data-music-toggle]')) return;

        // scene mode makes its own swoosh when the current tab is clicked again
        if (e.sceneToggle) return;
        if (el.matches('[data-nav-link]')) {
          // a rising pair from the destination piece's key
          const page = el.textContent.trim().toLowerCase();
          const notes = this.keyNotes(SONGS[page] ? page : null);
          this.sfx('chime', { notes: [notes[2] + 12, notes[4] + 12], gap: 0.08, vol: 0.08 });
        } else if (el.matches('[data-sidebar-btn]')) {
          // the sidebar's own handler has already run, so its class tells us the new state
          this.sfx('swoosh', { up: document.querySelector('[data-sidebar]').classList.contains('active') });
        } else if (el.matches('[data-filter-btn], [data-select-item], [data-select]')) {
          this.sfx('select');
        } else if (el.matches('.skill-label')) {
          const notes = this.keyNotes();
          this.sfx('chime', { notes: [notes[4] + 12], vol: 0.13, decay: 1.8 });
        } else if (!el.matches('[data-form-btn]')) {
          this.sfx('tap');
        }
      });

      // a bright little arpeggio as the message goes out
      document.addEventListener('submit', () => {
        const notes = this.keyNotes();
        this.sfx('chime', { notes: [notes[1] + 12, notes[2] + 12, notes[3] + 12, notes[4] + 24], gap: 0.07, vol: 0.06, decay: 1.6, verb: 0.5 });
      }, true);
    }

    setSong(name) {
      if (!SONGS[name]) return;
      const changed = name !== this.song;
      this.song = name;
      if (this.enabled && changed) this.playCurrent();
      this.render(changed && this.enabled);
    }

    // the old piece keeps playing while the new one loads, then they crossfade
    playCurrent() {
      const name = this.song, wanted = { name };
      this.wanted = wanted;
      if (!this.current) { this.tuning = true; this.render(); }
      this.loadLoop(name).then((buffer) => {
        if (this.tuning) { this.tuning = false; this.render(); }
        if (this.wanted !== wanted || !this.enabled) return;
        const c = this.ctx, now = c.currentTime;
        const gain = c.createGain(), src = c.createBufferSource();
        src.buffer = buffer;
        src.loop = true;
        src.connect(gain).connect(this.musicBus);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(1, now + FADE + 0.4);
        src.start(now);
        if (this.current) this.fadeOut(this.current, FADE);
        this.current = { name, src, gain };
      });
    }

    enable() {
      if (!this.ctx) this.setup();
      this.enabled = true;
      this.ctx.resume().then(() => {
        const n = this.keyNotes();
        this.sfx('chime', { notes: [n[0] + 12, n[2] + 12, n[4] + 12], gap: 0.09, vol: 0.07 });
      });
      // drop anything left over from when music was switched off mid-fade
      if (this.current) { this.fadeOut(this.current, 0.05); this.current = null; }
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(this.master.gain.value, now);
      this.master.gain.linearRampToValueAtTime(MUSIC_VOLUME, now + 1.5);
      this.playCurrent();
      this.writePref(true);
      this.render(true);
    }

    disable() {
      const n = this.keyNotes();
      this.sfx('chime', { notes: [n[4] + 12, n[1] + 12], gap: 0.09, vol: 0.065, decay: 0.8 });
      this.enabled = false;
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(this.master.gain.value, now);
      this.master.gain.linearRampToValueAtTime(0, now + 0.8);
      if (this.current) { this.fadeOut(this.current, 0.8); this.current = null; }
      this.wanted = null;
      setTimeout(() => { if (!this.enabled) this.ctx.suspend(); }, 900);
      this.writePref(false);
      this.render();
    }

    // the visitor's own on/off choice from the toggle
    toggle() {
      if (this.enabled) {
        // switched off after a game has been opened: no more auto-starting until they turn it back on
        if (this.gamesOpened) this.optOut = true;
        this.disable();
      } else {
        this.optOut = false;
        this.enable();
      }
    }

    // opening a game brings the music in, unless the visitor has since switched it off
    startForGame() {
      this.gamesOpened = true;
      if (!this.enabled && !this.optOut) this.enable();
    }

    render(announce) {
      const on = this.enabled;
      this.button.classList.toggle('is-playing', on);
      this.button.setAttribute('aria-pressed', String(on));
      this.button.setAttribute('aria-label', on ? `Pause music (now playing ${SONGS[this.song].title})` : 'Play music');
      const text = on ? (this.tuning ? 'Tuning up…' : SONGS[this.song].title) : 'Play music';
      if (this.label.textContent === text) return;
      if (announce) {
        // slide the new title in
        this.label.classList.add('is-changing');
        setTimeout(() => { this.label.textContent = text; this.label.classList.remove('is-changing'); }, 220);
      } else {
        this.label.textContent = text;
      }
    }

  }



  const button = document.querySelector('[data-music-toggle]');
  if (!button || !(window.AudioContext || window.webkitAudioContext)) {
    if (button) button.hidden = true;
    return;
  }

  const music = new Music(button);
  const active = document.querySelector('article.active[data-page]');
  music.setSong(active ? active.dataset.page : 'about');

  window.portfolioMusic = music;

  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 200));
  const preload = () => idle(() => music.preload(), { timeout: 2000 });
  if (document.readyState === 'complete') preload(); else window.addEventListener('load', preload, { once: true });

})();
