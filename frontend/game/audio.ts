// The sound of the house. All of it is synthesised at runtime — there is not
// a single audio file in this game.
//
// That is a deliberate choice rather than a shortcut. Horror sound stops
// working the moment the player recognises a loop, and a procedural engine
// can do things samples cannot: the boy's breathing rate is his actual fear,
// the thing hunting you is genuinely panned to where it is standing, and on
// the fourth floor the sonar ping you hear IS the mechanic that finds you.
//
// Everything is quiet. The loudest thing in the mix is usually a child
// breathing.

export type Surface = "wood" | "water" | "soft" | "stone";

export interface AudioState {
  /** 0 = still, 1 = sprinting. Drives breath and footfall weight. */
  effort: number;
  /** 0..1 from the floor's warden. Drives heartbeat and the air itself. */
  dread: number;
  hidden: boolean;
  /** Entity position relative to Theo, in world units (-left, +right). */
  entityDx: number | null;
  entityHunting: boolean;
  surface: Surface;
  battery: number;
  flashOn: boolean;
}

interface FloorProfile {
  /** Reverb decay in seconds — the size of the rooms. */
  decay: number;
  /** Room tone: filter centre and how wide. */
  toneHz: number;
  toneQ: number;
  toneGain: number;
  /** Colour of the drone under everything. */
  droneHz: number;
  droneGain: number;
  /** Random incidental noises: [minGap, maxGap] seconds. */
  incidental: [number, number];
  kind: "nursery" | "baths" | "pantry" | "study" | "corridors" | "mirrors" | "ground";
}

// The bed is deliberately near-inaudible. Everything that matters — a foot
// landing, a drip, a thing breathing — has to sit ON TOP of silence, not
// compete with a wash. If you can consciously hear the room tone, it is
// already too loud.
const PROFILES: Record<number, FloorProfile> = {
  7: { decay: 1.6, toneHz: 320, toneQ: 0.7, toneGain: 0.022, droneHz: 55, droneGain: 0.018, incidental: [9, 20], kind: "nursery" },
  6: { decay: 4.5, toneHz: 240, toneQ: 0.9, toneGain: 0.034, droneHz: 41, droneGain: 0.026, incidental: [3, 8], kind: "baths" },
  5: { decay: 1.2, toneHz: 180, toneQ: 1.4, toneGain: 0.03, droneHz: 48, droneGain: 0.028, incidental: [5, 12], kind: "pantry" },
  4: { decay: 0.35, toneHz: 140, toneQ: 2.0, toneGain: 0.018, droneHz: 62, droneGain: 0.015, incidental: [7, 16], kind: "study" },
  3: { decay: 5.5, toneHz: 110, toneQ: 0.8, toneGain: 0.027, droneHz: 36, droneGain: 0.03, incidental: [6, 14], kind: "corridors" },
  2: { decay: 2.8, toneHz: 900, toneQ: 3.0, toneGain: 0.016, droneHz: 74, droneGain: 0.02, incidental: [8, 18], kind: "mirrors" },
  1: { decay: 3.4, toneHz: 90, toneQ: 0.6, toneGain: 0.014, droneHz: 30, droneGain: 0.034, incidental: [14, 30], kind: "ground" },
};

export class NodAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private ambience!: GainNode;
  private sfx!: GainNode;
  private wet!: GainNode;
  private verb!: ConvolverNode;
  private noise!: AudioBuffer;

  // Continuous voices
  private toneSrc: AudioBufferSourceNode | null = null;
  private toneGain!: GainNode;
  private droneA: OscillatorNode | null = null;
  private droneB: OscillatorNode | null = null;
  private droneGain!: GainNode;
  private presenceGain!: GainNode;
  private presencePan!: StereoPannerNode;
  private presenceOsc: OscillatorNode | null = null;
  private presenceNoiseGain!: GainNode;

  private floor = 7;
  private profile = PROFILES[7];
  private breathT = 0;
  private incidentalT = 6;
  private heartT = 0;
  private whisperT = 4;
  private started = false;

  get ready() {
    return this.started;
  }

  /** Must be called from a user gesture or the browser will not allow sound. */
  async init() {
    if (this.started) return;
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    if (this.ctx.state === "suspended") await this.ctx.resume();

    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(c.destination);

    // A gentle limiter so a stinger can be loud without ever clipping
    const squash = c.createDynamicsCompressor();
    squash.threshold.value = -18;
    squash.knee.value = 12;
    squash.ratio.value = 6;
    squash.attack.value = 0.004;
    squash.release.value = 0.25;
    squash.connect(this.master);

    this.verb = c.createConvolver();
    this.wet = c.createGain();
    this.wet.gain.value = 0.5;
    this.verb.connect(this.wet);
    this.wet.connect(squash);

    this.ambience = c.createGain();
    this.ambience.gain.value = 1;
    this.ambience.connect(squash);
    this.ambience.connect(this.verb);

    this.sfx = c.createGain();
    this.sfx.gain.value = 1;
    this.sfx.connect(squash);
    this.sfx.connect(this.verb);

    this.noise = this.makeNoise(4);

    // Room tone bed
    this.toneGain = c.createGain();
    this.toneGain.gain.value = 0;
    this.toneGain.connect(this.ambience);

    // Sub drone
    this.droneGain = c.createGain();
    this.droneGain.gain.value = 0;
    this.droneGain.connect(this.ambience);

    // The thing in the room with you
    this.presencePan = c.createStereoPanner();
    this.presenceGain = c.createGain();
    this.presenceGain.gain.value = 0;
    this.presenceGain.connect(this.presencePan);
    this.presencePan.connect(this.ambience);
    this.presenceNoiseGain = c.createGain();
    this.presenceNoiseGain.gain.value = 0;
    this.presenceNoiseGain.connect(this.presencePan);

    this.started = true;
    this.setFloor(this.floor);
  }

  // ── Building blocks ────────────────────────────────────────────────

  private makeNoise(seconds: number): AudioBuffer {
    const c = this.ctx!;
    const len = Math.floor(c.sampleRate * seconds);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    // Pink-ish: cheaper than a real filter and kinder on the ears than white
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57555 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.22;
    }
    return buf;
  }

  /** A decaying-noise impulse response — the size and deadness of a room. */
  private makeImpulse(seconds: number, damp: number): AudioBuffer {
    const c = this.ctx!;
    const len = Math.max(1, Math.floor(c.sampleRate * seconds));
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const env = Math.pow(1 - t, damp);
        const w = (Math.random() * 2 - 1) * env;
        last = last * 0.4 + w * 0.6; // slight lowpass so tails are not hissy
        d[i] = last;
      }
    }
    return buf;
  }

  private now() {
    return this.ctx!.currentTime;
  }

  /** One-shot filtered noise burst. The workhorse for everything physical. */
  private burst(opts: {
    dur: number; gain: number; type?: BiquadFilterType; hz: number; q?: number;
    hzEnd?: number; pan?: number; attack?: number; dest?: AudioNode;
  }) {
    if (!this.started) return;
    const c = this.ctx!;
    const t = this.now();
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;

    const f = c.createBiquadFilter();
    f.type = opts.type ?? "bandpass";
    f.frequency.setValueAtTime(opts.hz, t);
    if (opts.hzEnd !== undefined) {
      f.frequency.exponentialRampToValueAtTime(Math.max(20, opts.hzEnd), t + opts.dur);
    }
    f.Q.value = opts.q ?? 1;

    const g = c.createGain();
    const atk = opts.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, opts.gain), t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);

    const p = c.createStereoPanner();
    p.pan.value = opts.pan ?? 0;

    src.connect(f); f.connect(g); g.connect(p);
    p.connect(opts.dest ?? this.sfx);
    src.start(t);
    src.stop(t + opts.dur + 0.05);
  }

  /** One-shot tone. Used for stingers, pings and the music box. */
  private tone(opts: {
    hz: number; hzEnd?: number; dur: number; gain: number;
    type?: OscillatorType; pan?: number; attack?: number; dest?: AudioNode;
  }) {
    if (!this.started) return;
    const c = this.ctx!;
    const t = this.now();
    const o = c.createOscillator();
    o.type = opts.type ?? "sine";
    o.frequency.setValueAtTime(opts.hz, t);
    if (opts.hzEnd !== undefined) {
      o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.hzEnd), t + opts.dur);
    }
    const g = c.createGain();
    const atk = opts.attack ?? 0.008;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, opts.gain), t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
    const p = c.createStereoPanner();
    p.pan.value = opts.pan ?? 0;
    o.connect(g); g.connect(p); p.connect(opts.dest ?? this.sfx);
    o.start(t);
    o.stop(t + opts.dur + 0.05);
  }

  // ── Per-floor setup ────────────────────────────────────────────────

  setFloor(n: number) {
    this.floor = n;
    this.profile = PROFILES[n] ?? PROFILES[7];
    if (!this.started) return;
    const c = this.ctx!;
    const p = this.profile;

    // Room size. The study is nearly anechoic; the corridors go on forever.
    this.verb.buffer = this.makeImpulse(p.decay, p.kind === "study" ? 6 : 2.4);
    this.wet.gain.setTargetAtTime(p.kind === "study" ? 0.12 : 0.55, this.now(), 0.6);

    // Room tone
    this.toneSrc?.stop();
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = p.toneHz;
    f.Q.value = p.toneQ;
    src.connect(f);
    f.connect(this.toneGain);
    src.start();
    this.toneSrc = src;
    this.toneGain.gain.setTargetAtTime(p.toneGain, this.now(), 1.5);

    // Sub drone, two oscillators a hair apart so it beats slowly
    this.droneA?.stop();
    this.droneB?.stop();
    const a = c.createOscillator();
    const b = c.createOscillator();
    a.type = b.type = "sine";
    a.frequency.value = p.droneHz;
    b.frequency.value = p.droneHz * 1.006;
    a.connect(this.droneGain);
    b.connect(this.droneGain);
    a.start(); b.start();
    this.droneA = a; this.droneB = b;
    this.droneGain.gain.setTargetAtTime(p.droneGain, this.now(), 2.0);

    this.incidentalT = 2 + Math.random() * 4;
  }

  // ── Per-frame ──────────────────────────────────────────────────────

  update(dt: number, s: AudioState) {
    if (!this.started) return;
    const t = this.now();

    // ── Breathing. The most important sound in the game. ──
    // Rate rises with effort and with how close the thing is to certain.
    const panic = Math.max(s.dread, s.effort * 0.55);
    if (s.hidden && s.dread > 0.35) {
      // He is holding his breath. Almost nothing — then a shaky release.
      this.breathT += dt * 0.28;
      if (this.breathT >= 1) {
        this.breathT = 0;
        this.burst({ dur: 0.5, gain: 0.075, hz: 520, q: 1.1, hzEnd: 300, attack: 0.09 });
      }
    } else {
      const rate = 0.26 + panic * 1.15;
      this.breathT += dt * rate;
      if (this.breathT >= 1) {
        this.breathT = 0;
        // He is the closest thing to the microphone. He should sound it.
        const g = 0.05 + panic * 0.13;
        // in
        this.burst({ dur: 0.26, gain: g, hz: 620 + panic * 260, q: 1.3, attack: 0.07 });
        // out, a moment later and lower
        setTimeout(() => {
          this.burst({ dur: 0.34, gain: g * 0.85, hz: 380, q: 1.0, hzEnd: 240, attack: 0.05 });
        }, 240 / (1 + panic));
      }
    }

    // ── Heartbeat: only once the house has noticed you ──
    if (s.dread > 0.25) {
      this.heartT += dt * (0.9 + s.dread * 1.6);
      if (this.heartT >= 1) {
        this.heartT = 0;
        const g = 0.05 + s.dread * 0.14;
        this.tone({ hz: 62, hzEnd: 44, dur: 0.16, gain: g, attack: 0.006 });
        setTimeout(() => this.tone({ hz: 55, hzEnd: 38, dur: 0.2, gain: g * 0.72, attack: 0.006 }), 190);
      }
    } else {
      this.heartT = 0;
    }

    // ── The thing in the room: panned to where it actually is ──
    if (s.entityDx !== null) {
      const dist = Math.abs(s.entityDx);
      const near = Math.max(0, 1 - dist / 18);
      this.presencePan.pan.setTargetAtTime(
        Math.max(-1, Math.min(1, s.entityDx / 12)), t, 0.25
      );
      const want = near * near * (s.entityHunting ? 0.16 : 0.075);
      this.presenceGain.gain.setTargetAtTime(want, t, 0.3);
      this.presenceNoiseGain.gain.setTargetAtTime(want * 0.6, t, 0.3);
      if (!this.presenceOsc) this.startPresence();
      if (this.presenceOsc) {
        // It rises in pitch as it closes — the oldest trick there is
        this.presenceOsc.frequency.setTargetAtTime(
          this.profile.droneHz * (1.5 + near * 0.9) * (s.entityHunting ? 1.35 : 1),
          t, 0.4
        );
      }
    } else {
      this.presenceGain.gain.setTargetAtTime(0, t, 0.5);
      this.presenceNoiseGain.gain.setTargetAtTime(0, t, 0.5);
    }

    // ── The room says something once in a while ──
    this.incidentalT -= dt;
    if (this.incidentalT <= 0) {
      const [lo, hi] = this.profile.incidental;
      this.incidentalT = lo + Math.random() * (hi - lo);
      this.incidental();
    }

    // ── The fourth floor whispers between its pings ──
    if (this.profile.kind === "study") {
      this.whisperT -= dt;
      if (this.whisperT <= 0) {
        this.whisperT = 2.5 + Math.random() * 4;
        this.whisper();
      }
    }

    // ── A dying torch buzzes ──
    if (s.flashOn && s.battery > 0 && s.battery < 22 && Math.random() < dt * 3) {
      this.burst({ dur: 0.07, gain: 0.03, hz: 2400, q: 6, pan: 0.15 });
    }
  }

  private startPresence() {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = this.profile.droneHz * 1.5;
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 300;
    o.connect(lp);
    lp.connect(this.presenceGain);
    o.start();
    this.presenceOsc = o;

    // Its body: a breathing/dragging noise layer
    const n = c.createBufferSource();
    n.buffer = this.noise;
    n.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = this.profile.kind === "baths" ? 700 : 420;
    bp.Q.value = 1.2;
    const lfo = c.createOscillator();
    const lfoGain = c.createGain();
    lfo.frequency.value = 0.22;
    lfoGain.gain.value = 0.7;
    lfo.connect(lfoGain);
    lfoGain.connect(bp.frequency);
    n.connect(bp);
    bp.connect(this.presenceNoiseGain);
    n.start(); lfo.start();
  }

  /** A noise the house makes on its own. Different per floor. */
  private incidental() {
    const pan = (Math.random() * 2 - 1) * 0.8;
    switch (this.profile.kind) {
      case "nursery":
        // a floorboard upstairs that cannot exist, or a music box note
        if (Math.random() < 0.45) {
          this.tone({ hz: 880 * (1 + Math.floor(Math.random() * 3) * 0.12), dur: 1.4, gain: 0.035, type: "triangle", pan });
        } else {
          this.burst({ dur: 0.5, gain: 0.05, hz: 260, hzEnd: 150, q: 4, pan });
        }
        break;
      case "baths":
        // a drip, into a lot of reverb
        this.tone({ hz: 1500 + Math.random() * 900, hzEnd: 500, dur: 0.09, gain: 0.09, pan });
        break;
      case "pantry":
        // flies, or something wet shifting its weight
        if (Math.random() < 0.5) {
          this.burst({ dur: 1.1, gain: 0.028, hz: 1700, q: 12, pan });
        } else {
          this.burst({ dur: 0.6, gain: 0.05, hz: 200, hzEnd: 90, q: 2, pan });
        }
        break;
      case "study":
        // paper, and a clock that is not in any of the rooms
        if (Math.random() < 0.5) this.burst({ dur: 0.35, gain: 0.04, hz: 3200, q: 2, pan });
        else this.tone({ hz: 1100, dur: 0.05, gain: 0.05, type: "square", pan: 0 });
        break;
      case "corridors":
        // the boards settling, a long way off
        this.burst({ dur: 1.6, gain: 0.07, hz: 120, hzEnd: 60, q: 3, pan, attack: 0.25 });
        break;
      case "mirrors":
        // glass finding its note
        this.tone({ hz: 2100 + Math.random() * 700, dur: 2.2, gain: 0.022, type: "sine", pan, attack: 0.6 });
        break;
      case "ground":
        // wind under a door that leads outside
        this.burst({ dur: 3.2, gain: 0.05, hz: 400, hzEnd: 220, q: 0.8, pan, attack: 1.1 });
        break;
    }
  }

  private whisper() {
    const pan = (Math.random() * 2 - 1) * 0.9;
    const c = this.ctx!;
    const t = this.now();
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1200;
    bp.Q.value = 3;
    // Formant wobble makes noise sound like it is trying to say a word
    const lfo = c.createOscillator();
    const lg = c.createGain();
    lfo.frequency.value = 5 + Math.random() * 5;
    lg.gain.value = 500;
    lfo.connect(lg); lg.connect(bp.frequency);
    const g = c.createGain();
    const dur = 0.8 + Math.random() * 0.7;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.035, t + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = c.createStereoPanner();
    p.pan.value = pan;
    src.connect(bp); bp.connect(g); g.connect(p); p.connect(this.sfx);
    src.start(t); lfo.start(t);
    src.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
  }

  // ── Events the game fires ──────────────────────────────────────────

  footstep(surface: Surface, effort: number, pan = 0) {
    if (!this.started) return;
    const w = 0.35 + effort * 0.65;
    switch (surface) {
      case "water":
        this.burst({ dur: 0.22 + w * 0.2, gain: 0.13 * w, hz: 1400, hzEnd: 600, q: 0.9, pan });
        this.burst({ dur: 0.4, gain: 0.08 * w, hz: 300, q: 1.4, pan, attack: 0.02 });
        break;
      case "soft":
        // Muffled on purpose: this is what safety sounds like on floor three
        this.burst({ dur: 0.1, gain: 0.035 * w, hz: 240, q: 1.2, pan, type: "lowpass" });
        break;
      case "stone":
        this.burst({ dur: 0.07, gain: 0.1 * w, hz: 900, q: 1.6, pan });
        this.tone({ hz: 90, hzEnd: 55, dur: 0.1, gain: 0.075 * w, pan });
        break;
      default: // wood
        this.burst({ dur: 0.08, gain: 0.09 * w, hz: 520, q: 1.4, pan });
        this.tone({ hz: 78, hzEnd: 50, dur: 0.13, gain: 0.085 * w, pan });
        // the board complains about it
        if (Math.random() < 0.22 + effort * 0.2) {
          this.burst({ dur: 0.3, gain: 0.05 * w, hz: 700, hzEnd: 1100, q: 8, pan, attack: 0.05 });
        }
    }
  }

  /** Floor 4's sonar pulse. This one is information, not decoration. */
  ping() {
    this.tone({ hz: 2600, hzEnd: 900, dur: 0.34, gain: 0.16, type: "sine", attack: 0.004 });
    this.tone({ hz: 1300, hzEnd: 450, dur: 0.5, gain: 0.09, type: "sine", attack: 0.01 });
  }

  /** It has seen you. The moment the player needs to feel in their chest. */
  spotted() {
    this.tone({ hz: 220, hzEnd: 190, dur: 0.9, gain: 0.11, type: "sawtooth", attack: 0.004 });
    this.tone({ hz: 331, hzEnd: 287, dur: 0.9, gain: 0.07, type: "sawtooth", attack: 0.004 });
    this.burst({ dur: 0.5, gain: 0.06, hz: 3000, hzEnd: 700, q: 0.8 });
  }

  /** It is coming. */
  hunt() {
    this.tone({ hz: 110, hzEnd: 88, dur: 1.6, gain: 0.12, type: "sawtooth", attack: 0.02 });
    this.tone({ hz: 164, hzEnd: 131, dur: 1.6, gain: 0.08, type: "square", attack: 0.02 });
  }

  /** It has you. */
  caught() {
    this.tone({ hz: 440, hzEnd: 40, dur: 1.4, gain: 0.16, type: "sawtooth", attack: 0.002 });
    this.tone({ hz: 293, hzEnd: 35, dur: 1.6, gain: 0.12, type: "square", attack: 0.002 });
    this.burst({ dur: 1.2, gain: 0.1, hz: 2000, hzEnd: 120, q: 0.6 });
  }

  keyTaken() {
    this.tone({ hz: 2100, dur: 0.5, gain: 0.06, type: "triangle", attack: 0.003 });
    this.tone({ hz: 3150, dur: 0.35, gain: 0.035, type: "triangle", attack: 0.003 });
  }

  doorOpens() {
    this.burst({ dur: 1.8, gain: 0.09, hz: 180, hzEnd: 90, q: 3, attack: 0.15 });
    this.tone({ hz: 60, hzEnd: 42, dur: 2.2, gain: 0.07, attack: 0.4 });
  }

  descend() {
    this.tone({ hz: 180, hzEnd: 36, dur: 2.6, gain: 0.1, type: "sine", attack: 0.15 });
    this.burst({ dur: 2.4, gain: 0.06, hz: 700, hzEnd: 120, q: 0.7, attack: 0.5 });
  }

  pickup() {
    this.burst({ dur: 0.12, gain: 0.035, hz: 1100, q: 3 });
  }

  valve() {
    this.burst({ dur: 1.2, gain: 0.06, hz: 900, hzEnd: 1600, q: 9, attack: 0.1 });
  }

  /** Water leaving a very large tank, for a very long time. */
  drain(seconds: number) {
    if (!this.started) return;
    const c = this.ctx!;
    const t = this.now();
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.setValueAtTime(600, t);
    f.frequency.exponentialRampToValueAtTime(140, t + seconds);
    f.Q.value = 1.1;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.11, t + 0.4);
    g.gain.setValueAtTime(0.11, t + seconds - 1.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    src.connect(f); f.connect(g); g.connect(this.sfx);
    src.start(t);
    src.stop(t + seconds + 0.1);
  }

  mirrorCovered() {
    this.burst({ dur: 0.7, gain: 0.05, hz: 2600, hzEnd: 400, q: 1.2, attack: 0.04 });
  }

  /** Someone else's child, remembered. Played when a mark is revealed. */
  remembered() {
    this.tone({ hz: 392, dur: 3.0, gain: 0.03, type: "sine", attack: 1.0 });
    this.tone({ hz: 466, dur: 3.4, gain: 0.022, type: "sine", attack: 1.4 });
  }

  /** Duck everything for a fade. */
  duck(to: number, seconds = 0.4) {
    if (!this.started) return;
    this.master.gain.setTargetAtTime(to, this.now(), seconds);
  }

  dispose() {
    try {
      this.toneSrc?.stop();
      this.droneA?.stop();
      this.droneB?.stop();
      this.presenceOsc?.stop();
      void this.ctx?.close();
    } catch {
      /* already gone */
    }
    this.started = false;
  }
}
