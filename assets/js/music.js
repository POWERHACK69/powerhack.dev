'use strict';

/**
 * Ambient soundtrack: one composed piece per page, synthesised live with the
 * Web Audio API and crossfaded when the page changes.
 *
 * Each piece is a looping chord progression plus written melody lines;
 * a few layers (twinkles, bubbles, droplets) add gentle variation per bar.
 */
(function () {

  const MUSIC_VOLUME = 0.34; // master level for the soundtrack, kept well under the page
  const SFX_VOLUME = 0.45;   // interaction sounds, on their own bus beside the music
  const FADE = 3.2;          // crossfade length in seconds
  const LOOKAHEAD = 0.3;     // schedule bars this far ahead of the playhead
  const STORAGE_KEY = 'portfolio-music';



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

  // 'E5:1.5 G5:0.5 r:2 | A5:4' -> [{ b, m, d }], beats from `start`; '|' is just a visual bar line
  function seq(str, start, props) {
    const out = [];
    let b = start;
    for (const tok of str.split(/[\s|]+/).filter(Boolean)) {
      const [n, d] = tok.split(':');
      if (n !== 'r') out.push(Object.assign({ b, m: midi(n), d: +d }, props));
      b += +d;
    }
    return out;
  }

  // a sustained chord, voices spread gently across the stereo field
  function padChord(ev, b, voicing, d, props) {
    const notes = chord(voicing);
    notes.forEach((m, k) => ev.push(Object.assign({ b, i: 'pad', m, d, v: 0.8, pan: (k / (notes.length - 1) - 0.5) * 0.7 }, props)));
  }



  /**
   * #ABOUT: "Aurora Fjord", D Lydian. Slow pad swells, a bell melody, starlight twinkles.
   */

  const auroraFjord = {
    title: 'Aurora Fjord',
    bpm: 58,
    bars: 16,
    echo: { beats: 0.75, fb: 0.38 },
    bed: 'wind',
    prog: [
      ['D2', 'D3 A3 C#4 E4 F#4'],
      ['D2', 'D3 B3 E4 G#4 B4'],
      ['B1', 'B2 F#3 A3 C#4 D4'],
      ['G1', 'G2 D3 F#3 B3 C#4'],
      ['D2', 'D3 A3 C#4 E4 F#4'],
      ['D2', 'D3 B3 E4 G#4 B4'],
      ['G1', 'G2 D3 F#3 B3 C#4'],
      ['A1', 'A2 E3 A3 B3 E4']
    ],

    compose() {
      const ev = [];
      this.prog.forEach(([root, voicing], n) => {
        padChord(ev, n * 8, voicing, 8, { cut: 900, verb: 0.6 });
        ev.push({ b: n * 8, i: 'bass', m: midi(root), d: 7.5, v: 0.7, verb: 0.2 });
      });
      ev.push(...seq(
        'F#5:3 E5:1 A5:4 | G#5:2 B5:2 E5:4 | D5:3 C#5:1 F#5:4 | C#6:2 B5:2 A5:4 |' +
        'A5:2 F#5:2 E5:2 D5:2 | E5:3 G#5:1 B5:4 | B5:2 A5:1 F#5:1 C#6:4 | B5:3 A5:1 E5:4',
        0, { i: 'bell', part: 'melody', v: 0.75, verb: 0.55, echo: 0.3, decay: 4.5 }
      ));
      return ev;
    },

    // stars: high chord tones twinkling at random
    extras(bar, add) {
      const notes = chord(this.prog[(bar >> 1) % this.prog.length][1]);
      for (let e = 0; e < 8; e++) {
        if (Math.random() < 0.28) {
          add({ b: e * 0.5, i: 'bell', m: pick(notes) + pick([12, 24]), d: 1, v: rand(0.12, 0.22), pan: rand(-0.8, 0.8), verb: 0.7, echo: 0.5, decay: 2.5 });
        }
      }
    }
  };



  /**
   * #RESUME: "Lotus & Fireflies", A minor pentatonic. Koto-like plucks over a warm pad.
   */

  const lotusFireflies = {
    title: 'Lotus & Fireflies',
    bpm: 74,
    bars: 16,
    echo: { beats: 1, fb: 0.3 },
    bed: 'water',
    prog: [
      ['A2', 'A3 C4 E4 G4 B4'],
      ['F2', 'F3 A3 C4 E4 G4'],
      ['C2', 'C3 G3 B3 E4 G4'],
      ['G2', 'G3 B3 D4 E4 G4'],
      ['A2', 'A3 C4 E4 G4 B4'],
      ['F2', 'F3 A3 C4 E4 G4'],
      ['D2', 'D3 F3 A3 C4 E4'],
      ['E2', 'E3 A3 B3 D4 E4']
    ],

    compose() {
      const ev = [];
      // gentle broken-chord ostinato: one . three five . four three .
      const pattern = [0, -1, 2, 4, -1, 3, 2, -1];
      this.prog.forEach(([root, voicing], n) => {
        const notes = chord(voicing);
        padChord(ev, n * 8, voicing, 8, { v: 0.5, cut: 700, verb: 0.5 });
        ev.push({ b: n * 8, i: 'bass', m: midi(root), d: 3.5, v: 0.75 });
        ev.push({ b: n * 8 + 4, i: 'bass', m: midi(root) + 7, d: 3.5, v: 0.55 });
        for (let half = 0; half < 2; half++) {
          pattern.forEach((p, s) => {
            if (p >= 0) ev.push({ b: n * 8 + half * 4 + s * 0.5, i: 'pluck', m: notes[p] + 12, d: 0.5, v: 0.32, pan: -0.25, verb: 0.3, decay: 1.2 });
          });
        }
      });
      ev.push(...seq(
        'E5:1.5 G5:0.5 A5:2 G5:1 E5:1 D5:2 | C5:2 D5:1 E5:1 G5:3 E5:1 | E5:1 D5:1 C5:2 G4:2 A4:2 | D5:3 E5:1 D5:4 |' +
        'A5:1 C6:1 A5:1 G5:1 E5:2 G5:2 | A5:3 G5:1 E5:2 D5:2 | F5:2 E5:1 D5:1 C5:2 D5:2 | B4:2 D5:2 E5:4',
        0, { i: 'pluck', part: 'melody', v: 0.7, pan: 0.2, verb: 0.45, echo: 0.25, decay: 2.2 }
      ));
      return ev;
    },

    // fireflies blinking high above the pond, the odd droplet below
    extras(bar, add) {
      const penta = ['A6', 'C7', 'D7', 'E7', 'G7'].map(midi);
      for (let beat = 0; beat < 4; beat++) {
        if (Math.random() < 0.3) add({ b: beat + pick([0, 0.5]), i: 'bell', m: pick(penta), d: 0.5, v: rand(0.08, 0.16), pan: rand(-0.9, 0.9), verb: 0.75, echo: 0.6, decay: 1.4 });
      }
      if (Math.random() < 0.45) add({ b: rand(0, 4), i: 'drop', m: midi(pick(['E6', 'G6', 'A6'])), d: 0.2, v: rand(0.4, 0.7), pan: rand(-0.6, 0.6), verb: 0.5 });
    }
  };



  /**
   * #PORTFOLIO: "Koi Pond", D minor. Rippling harp arpeggios under a breathy flute.
   */

  const koiPond = {
    title: 'Koi Pond',
    bpm: 80,
    bars: 16,
    echo: { beats: 1.5, fb: 0.28 },
    bed: 'water',
    prog: [
      ['D2', 'D3 A3 C4 E4 F4'],
      ['Bb1', 'Bb2 F3 A3 C4 D4'],
      ['G1', 'G2 D3 F3 A3 Bb3'],
      ['A1', 'A2 E3 G3 A3 D4'],
      ['D2', 'D3 A3 C4 E4 F4'],
      ['F1', 'F2 C3 E3 A3 C4'],
      ['G1', 'G2 D3 F3 A3 Bb3'],
      ['A1', 'A2 E3 A3 C#4 E4']
    ],

    compose() {
      const ev = [];
      // arpeggios rise and fall like a fish's arc; the pan drifts across with them
      const shape = [0, 1, 2, 3, 4, 3, 2, 1];
      this.prog.forEach(([root, voicing], n) => {
        const notes = chord(voicing);
        padChord(ev, n * 8, voicing, 8, { v: 0.45, cut: 650, verb: 0.5 });
        ev.push({ b: n * 8, i: 'bass', m: midi(root), d: 5.5, v: 0.75 });
        ev.push({ b: n * 8 + 6, i: 'bass', m: midi(root) + 7, d: 1.8, v: 0.5 });
        for (let half = 0; half < 2; half++) {
          shape.forEach((p, s) => {
            const pan = Math.sin((half * 8 + s) / 16 * Math.PI * 2) * 0.6;
            ev.push({ b: n * 8 + half * 4 + s * 0.5, i: 'harp', m: notes[p] + 12, d: 1, v: 0.3, pan, verb: 0.4, echo: 0.12 });
          });
        }
      });
      ev.push(...seq(
        'A4:2 D5:1 E5:1 F5:3 E5:1 | D5:2 C5:1 D5:1 F5:4 | G5:3 F5:1 D5:2 Bb4:2 | A4:6 r:2 |' +
        'D5:1 E5:1 F5:2 A5:3 G5:1 | F5:2 E5:1 C5:1 A4:4 | Bb4:2 C5:2 D5:2 G5:2 | E5:3 C#5:1 A4:4',
        0, { i: 'flute', part: 'melody', v: 0.7, pan: 0.1, verb: 0.5, echo: 0.2 }
      ));
      return ev;
    },

    // a koi breaks the surface now and then
    extras(bar, add) {
      if (Math.random() < 0.35) add({ b: rand(0, 4), i: 'drop', m: midi(pick(['D6', 'F6', 'A6'])), d: 0.2, v: rand(0.3, 0.55), pan: rand(-0.7, 0.7), verb: 0.5 });
    }
  };



  /**
   * #CONTACT: "Jellyfish Reef", E Lydian. A wavering underwater pad, soft mallets, rising bubbles.
   */

  const jellyfishReef = {
    title: 'Jellyfish Reef',
    bpm: 64,
    bars: 16,
    echo: { beats: 0.75, fb: 0.45 },
    bed: 'deep',
    prog: [
      ['E2', 'E3 B3 D#4 F#4 G#4'],
      ['C#2', 'C#3 G#3 B3 D#4 E4'],
      ['A1', 'A2 E3 G#3 B3 C#4'],
      ['B1', 'B2 F#3 G#3 B3 E4'],
      ['E2', 'E3 B3 D#4 F#4 G#4'],
      ['G#1', 'G#2 D#3 F#3 B3 D#4'],
      ['A1', 'A2 E3 G#3 B3 D#4'],
      ['B1', 'B2 F#3 A#3 D#4 F#4']
    ],

    compose() {
      const ev = [];
      this.prog.forEach(([root, voicing], n) => {
        const notes = chord(voicing);
        padChord(ev, n * 8, voicing, 8, { v: 0.7, cut: 800, wobble: true, verb: 0.65 });
        ev.push({ b: n * 8, i: 'bass', m: midi(root), d: 7.5, v: 0.8 });
        // mallets on dotted eighths drift against the beat, like slow pulsing bells
        for (let s = 0; s * 0.75 < 8; s++) {
          ev.push({ b: n * 8 + s * 0.75, i: 'marimba', m: notes[(s * 2 + 1) % notes.length] + 12, d: 0.5, v: s % 2 ? 0.22 : 0.32, pan: s % 2 ? 0.45 : -0.45, verb: 0.45, echo: 0.3 });
        }
      });
      ev.push(...seq(
        'B4:3 G#4:1 D#5:4 | E5:2 D#5:2 B4:4 | C#5:3 E5:1 G#5:4 | F#5:6 E5:2 |' +
        'G#5:2 F#5:2 D#5:2 B4:2 | D#5:3 F#5:1 B5:4 | C#5:2 D#5:2 E5:4 | F#5:3 D#5:1 B4:4',
        0, { i: 'glass', part: 'melody', v: 0.75, verb: 0.7, echo: 0.4 }
      ));
      return ev;
    },

    extras(bar, add) {
      const n = Math.random() < 0.6 ? (2 + Math.random() * 4) | 0 : 0;
      let b = rand(0, 3);
      for (let k = 0; k < n; k++) {
        add({ b, i: 'bubble', m: midi(pick(['E5', 'G#5', 'B5', 'C#6', 'E6'])), d: 0.1, v: rand(0.4, 0.8), pan: rand(-0.8, 0.8), verb: 0.5, echo: 0.2 });
        b += rand(0.08, 0.2);
      }
    }
  };

  const SONGS = { about: auroraFjord, resume: lotusFireflies, portfolio: koiPond, contact: jellyfishReef };



  /**
   * instruments: each takes (player, time, frequency, duration, velocity, event)
   * and connects its voice to player.voiceOut()
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

  const INST = {

    pad(p, t, f, dur, v, ev) {
      const c = p.ctx, end = t + dur, stop = end + 5;
      const lp = c.createBiquadFilter(), g = c.createGain();
      lp.type = 'lowpass';
      lp.frequency.value = ev.cut || 1000;
      lp.Q.value = 0.4;
      const lvl = v * 0.04;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(lvl, t + 1.8);
      g.gain.setValueAtTime(lvl, end);
      g.gain.setTargetAtTime(0, end, 0.9);
      for (const [type, det, mul, amp] of [['sawtooth', -8, 1, 1], ['sawtooth', 7, 1, 1], ['triangle', 0, 0.5, 0.8]]) {
        const o = osc(c, type, f * mul, t, stop);
        o.detune.value = det;
        o.connect(gainAt(c, t, amp)).connect(lp);
      }
      if (ev.wobble) {
        // slow filter sway: the sound of being underwater
        const lfo = osc(c, 'sine', 0.13, t, stop);
        lfo.connect(gainAt(c, t, 380)).connect(lp.frequency);
      }
      lp.connect(g).connect(p.voiceOut(ev));
    },

    bass(p, t, f, dur, v, ev) {
      const c = p.ctx, end = t + dur;
      const lp = c.createBiquadFilter(), g = c.createGain();
      lp.type = 'lowpass';
      lp.frequency.value = 380;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v * 0.32, t + 0.12);
      g.gain.setValueAtTime(v * 0.32, end);
      g.gain.setTargetAtTime(0, end, 0.3);
      osc(c, 'sine', f, t, end + 2).connect(lp);
      osc(c, 'triangle', f, t, end + 2).connect(gainAt(c, t, 0.35)).connect(lp);
      lp.connect(g).connect(p.voiceOut(ev));
    },

    // glassy bell: fundamental plus two inharmonic partials
    bell(p, t, f, dur, v, ev) {
      const c = p.ctx, decay = ev.decay || 3.5, out = p.voiceOut(ev);
      for (const [ratio, amp, dk] of [[1, 1, 1], [2.76, 0.32, 0.35], [5.4, 0.1, 0.15]]) {
        const g = c.createGain();
        strike(g, t, v * 0.14 * amp, decay * dk);
        osc(c, 'sine', f * ratio, t, t + decay * dk + 0.1).connect(g).connect(out);
      }
    },

    // koto-like pluck: bright attack that darkens, with a small upward bend into pitch
    pluck(p, t, f, dur, v, ev) {
      const c = p.ctx, decay = ev.decay || 1.6, stop = t + decay + 0.1;
      const lp = c.createBiquadFilter(), g = c.createGain();
      lp.type = 'lowpass';
      lp.Q.value = 1.4;
      lp.frequency.setValueAtTime(5200, t);
      lp.frequency.exponentialRampToValueAtTime(900, t + 0.35);
      strike(g, t, v * 0.2, decay);
      const a = osc(c, 'triangle', f * 0.985, t, stop), b = osc(c, 'sawtooth', f * 0.985, t, stop);
      a.frequency.exponentialRampToValueAtTime(f, t + 0.06);
      b.frequency.exponentialRampToValueAtTime(f, t + 0.06);
      a.connect(lp);
      b.connect(gainAt(c, t, 0.22)).connect(lp);
      lp.connect(g).connect(p.voiceOut(ev));
    },

    harp(p, t, f, dur, v, ev) {
      const c = p.ctx, decay = 2.4, stop = t + decay + 0.1;
      const lp = c.createBiquadFilter(), g = c.createGain();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(3200, t);
      lp.frequency.exponentialRampToValueAtTime(1100, t + 0.5);
      strike(g, t, v * 0.2, decay);
      osc(c, 'triangle', f, t, stop).connect(lp);
      osc(c, 'sine', f * 2, t, stop).connect(gainAt(c, t, 0.15)).connect(lp);
      lp.connect(g).connect(p.voiceOut(ev));
    },

    // breathy flute: sine body, delayed vibrato and a whisper of filtered noise
    flute(p, t, f, dur, v, ev) {
      const c = p.ctx, end = t + dur * p.spb * 0.95, stop = end + 1;
      const g = c.createGain(), lvl = v * 0.11;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(lvl, t + 0.12);
      g.gain.setValueAtTime(lvl, end);
      g.gain.setTargetAtTime(0, end, 0.12);

      const body = osc(c, 'sine', f, t, stop), over = osc(c, 'triangle', f * 2, t, stop);
      const vib = osc(c, 'sine', 5.2, t, stop), depth = c.createGain();
      depth.gain.setValueAtTime(0, t);
      depth.gain.linearRampToValueAtTime(f * 0.006, t + 0.5);
      vib.connect(depth);
      depth.connect(body.frequency);
      depth.connect(over.frequency);
      body.connect(g);
      over.connect(gainAt(c, t, 0.07)).connect(g);

      const breath = c.createBufferSource(), bp = c.createBiquadFilter();
      breath.buffer = p.engine.noise;
      breath.loop = true;
      bp.type = 'bandpass';
      bp.frequency.value = f * 2;
      bp.Q.value = 2;
      breath.connect(bp).connect(gainAt(c, t, 0.35)).connect(g);
      breath.start(t);
      breath.stop(stop);

      g.connect(p.voiceOut(ev));
    },

    marimba(p, t, f, dur, v, ev) {
      const c = p.ctx, out = p.voiceOut(ev);
      for (const [ratio, amp, decay] of [[1, 1, 1.1], [4, 0.18, 0.14], [10, 0.04, 0.03]]) {
        const g = c.createGain();
        strike(g, t, v * 0.22 * amp, decay);
        osc(c, 'sine', f * ratio, t, t + decay + 0.05).connect(g).connect(out);
      }
    },

    // the reef lead: soft sine with gentle overtones and a slow swell
    glass(p, t, f, dur, v, ev) {
      const c = p.ctx, end = t + dur * p.spb, stop = end + 3;
      const g = c.createGain(), lvl = v * 0.09;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(lvl, t + 0.25);
      g.gain.setValueAtTime(lvl, end);
      g.gain.setTargetAtTime(0, end, 0.5);
      const vib = osc(c, 'sine', 4.2, t, stop), depth = gainAt(c, t, f * 0.004);
      vib.connect(depth);
      for (const [ratio, amp] of [[1, 1], [2, 0.14], [3, 0.05]]) {
        const o = osc(c, 'sine', f * ratio, t, stop);
        depth.connect(o.frequency);
        o.connect(gainAt(c, t, amp)).connect(g);
      }
      g.connect(p.voiceOut(ev));
    },

    // water droplet: a fast upward chirp
    drop(p, t, f, dur, v, ev) {
      const c = p.ctx, g = c.createGain();
      strike(g, t, v * 0.09, 0.12);
      const o = osc(c, 'sine', f * 0.6, t, t + 0.15);
      o.frequency.exponentialRampToValueAtTime(f * 1.6, t + 0.07);
      o.connect(g).connect(p.voiceOut(ev));
    },

    bubble(p, t, f, dur, v, ev) {
      const c = p.ctx, g = c.createGain();
      strike(g, t, v * 0.07, 0.16);
      const o = osc(c, 'sine', f, t, t + 0.2);
      o.frequency.exponentialRampToValueAtTime(f * 2.6, t + 0.1);
      o.connect(g).connect(p.voiceOut(ev));
    }
  };

  // looping filtered-noise ambience under each piece
  const BEDS = {
    wind: { type: 'bandpass', freq: 520, q: 0.7, level: 0.028, sweep: 320, rate: 0.06 },
    water: { type: 'lowpass', freq: 900, q: 0.3, level: 0.014, sweep: 250, rate: 0.11 },
    deep: { type: 'lowpass', freq: 240, q: 0.6, level: 0.06, sweep: 90, rate: 0.08 }
  };



  /**
   * one playing instance of a piece, with its own buses so it can fade on its own
   */

  class Player {

    constructor(engine, def) {
      const c = this.ctx = engine.ctx;
      this.engine = engine;
      this.def = def;
      this.spb = 60 / def.bpm;
      this.barLen = this.spb * 4;

      // dry and reverb paths fade together
      this.fade = c.createGain();
      this.fadeWet = c.createGain();
      this.fade.connect(engine.bus);
      this.fadeWet.connect(engine.reverb);

      this.dry = c.createGain();
      this.wet = c.createGain();
      this.dry.connect(this.fade);
      this.wet.connect(this.fadeWet);

      // tempo-synced echo, darkened a little on each repeat
      this.echo = c.createGain();
      const delay = c.createDelay(4), fb = c.createGain(), tone = c.createBiquadFilter();
      delay.delayTime.value = def.echo.beats * this.spb;
      fb.gain.value = def.echo.fb;
      tone.type = 'lowpass';
      tone.frequency.value = 2600;
      this.echo.connect(delay);
      delay.connect(tone).connect(fb).connect(delay);
      tone.connect(this.fade);
      tone.connect(gainAt(c, 0, 0.4)).connect(this.fadeWet);

      // events grouped by bar for quick scheduling
      this.byBar = Array.from({ length: def.bars }, () => []);
      for (const ev of def.compose()) this.byBar[Math.floor(ev.b / 4) % def.bars].push(ev);
    }

    voiceOut(ev) {
      const c = this.ctx, pan = c.createStereoPanner();
      pan.pan.value = ev.pan || 0;
      pan.connect(this.dry);
      if (ev.verb) pan.connect(gainAt(c, 0, ev.verb)).connect(this.wet);
      if (ev.echo) pan.connect(gainAt(c, 0, ev.echo)).connect(this.echo);
      return pan;
    }

    start(now) {
      this.t0 = now + 0.15;
      this.nextBar = 0;
      this.endAt = 0;
      for (const g of [this.fade, this.fadeWet]) {
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(1, now + FADE + 0.4);
      }
      this.startBed(now);
    }

    stop(now) {
      if (this.endAt) return;
      this.endAt = now + FADE;
      for (const g of [this.fade, this.fadeWet]) {
        g.gain.cancelScheduledValues(now);
        g.gain.setValueAtTime(g.gain.value, now);
        g.gain.linearRampToValueAtTime(0, this.endAt);
      }
      if (this.bed) this.bed.stop(this.endAt + 0.1);
    }

    startBed(now) {
      const b = BEDS[this.def.bed];
      if (!b) return;
      const c = this.ctx, src = c.createBufferSource(), f = c.createBiquadFilter(), g = gainAt(c, now, b.level);
      src.buffer = this.engine.noise;
      src.loop = true;
      f.type = b.type;
      f.frequency.value = b.freq;
      f.Q.value = b.q;
      const lfo = osc(c, 'sine', b.rate, now, now + 3600);
      lfo.connect(gainAt(c, now, b.sweep)).connect(f.frequency);
      src.connect(f).connect(g);
      g.connect(this.dry);
      g.connect(gainAt(c, now, 0.5)).connect(this.wet);
      src.start(now);
      this.bed = src;
      this.bedLfo = lfo;
    }

    // cut this instance out of the graph for good
    kill() {
      if (this.bedLfo) this.bedLfo.stop();
      if (this.bed) this.bed.stop();
      this.fade.disconnect();
      this.fadeWet.disconnect();
    }

    // returns false once the piece has faded out completely
    tick(now) {
      if (this.endAt && now > this.endAt + 0.5) {
        this.kill();
        return false;
      }
      while (true) {
        const barStart = this.t0 + this.nextBar * this.barLen;
        if (barStart > now + LOOKAHEAD || (this.endAt && barStart > this.endAt)) break;
        this.scheduleBar(this.nextBar, barStart);
        this.nextBar++;
      }
      return true;
    }

    scheduleBar(n, barStart) {
      const loopBar = n % this.def.bars, offset = loopBar * 4;
      for (const ev of this.byBar[loopBar]) this.play(ev, barStart + (ev.b - offset) * this.spb);
      if (this.def.extras) this.def.extras(loopBar, (ev) => this.play(ev, barStart + ev.b * this.spb));
    }

    play(ev, t) {
      const inst = INST[ev.i || 'bell'];
      // a touch of human looseness on the struck instruments
      const loose = ev.i === 'pluck' || ev.i === 'harp' || ev.i === 'marimba';
      const v = loose ? ev.v * rand(0.85, 1.1) : ev.v;
      inst(this, Math.max(this.ctx.currentTime, t + (loose ? rand(0, 0.012) : 0)), mtof(ev.m), ev.i === 'pad' || ev.i === 'bass' ? ev.d * this.spb : ev.d, v, ev);
    }

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
      this.players = [];
      this.current = null;

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
      const c = this.ctx = new (window.AudioContext || window.webkitAudioContext)();

      this.master = c.createGain();
      this.master.gain.value = 0;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 3;
      comp.attack.value = 0.02;
      comp.release.value = 0.4;
      this.bus = c.createGain();
      this.bus.connect(comp).connect(this.master).connect(c.destination);

      // a long, soft hall built from decaying stereo noise
      this.reverb = c.createConvolver();
      const len = Math.floor(c.sampleRate * 4.5), ir = c.createBuffer(2, len, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        let prev = 0;
        for (let i = 0; i < len; i++) {
          prev = prev * 0.6 + (Math.random() * 2 - 1) * 0.4;
          d[i] = prev * Math.pow(1 - i / len, 3.2);
        }
      }
      this.reverb.buffer = ir;
      this.reverb.connect(gainAt(c, 0, 0.55)).connect(this.bus);

      // sound effects skip the music's fades and level, with a light compressor of their own
      const sfxComp = c.createDynamicsCompressor();
      sfxComp.threshold.value = -20;
      sfxComp.ratio.value = 4;
      this.sfxBus = c.createGain();
      this.sfxBus.gain.value = SFX_VOLUME;
      this.sfxBus.connect(sfxComp).connect(c.destination);

      this.noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const nd = this.noise.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

      this.timer = setInterval(() => this.tick(), 50);
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
      return chord(SONGS[song || this.song].prog[0][1]);
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

    tick() {
      if (!this.ctx || this.ctx.state !== 'running') return;
      const now = this.ctx.currentTime;
      this.players = this.players.filter((p) => p.tick(now));
    }

    setSong(name) {
      if (!SONGS[name]) return;
      const changed = name !== this.song;
      this.song = name;
      if (this.enabled && changed) this.playCurrent();
      this.render(changed && this.enabled);
    }

    playCurrent() {
      const now = this.ctx.currentTime;
      if (this.current) this.current.stop(now);
      this.current = new Player(this, SONGS[this.song]);
      this.current.start(now);
      this.players.push(this.current);
      this.tick();
    }

    enable() {
      if (!this.ctx) this.setup();
      this.enabled = true;
      this.ctx.resume().then(() => {
        const n = this.keyNotes();
        this.sfx('chime', { notes: [n[0] + 12, n[2] + 12, n[4] + 12], gap: 0.09, vol: 0.07 });
      });
      // drop any tail left over from when music was switched off mid-fade
      for (const p of this.players) p.kill();
      this.players = [];
      this.current = null;
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
      for (const p of this.players) p.stop(now);
      this.current = null;
      setTimeout(() => { if (!this.enabled) this.ctx.suspend(); }, 900);
      this.writePref(false);
      this.render();
    }

    toggle() {
      if (this.enabled) this.disable(); else this.enable();
    }

    render(announce) {
      const on = this.enabled;
      this.button.classList.toggle('is-playing', on);
      this.button.setAttribute('aria-pressed', String(on));
      this.button.setAttribute('aria-label', on ? `Pause music (now playing ${SONGS[this.song].title})` : 'Play music');
      const text = on ? SONGS[this.song].title : 'Play music';
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

})();
