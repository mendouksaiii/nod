"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The house, seen from the field.
 *
 * Drawn as one SVG rather than a Three.js scene on purpose: the title screen
 * has to paint on the first frame, and standing up a WebGL context here would
 * put a renderer between the visitor and the door for no gameplay reason.
 * Everything moves on CSS transforms, so there is no JS running behind the
 * title at all.
 *
 * Read back to front: sky, moon, treeline, the house, then three depths of
 * grass with fog banked between them. The haze is what puts the house far
 * away — the silhouette alone would just read as small.
 */

/**
 * Deterministic PRNG.
 *
 * Math.random() here would generate different grass on the server and the
 * client and React would throw a hydration mismatch on every load, so the
 * field is seeded and identical in both places.
 */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** One band of grass. Nearer bands are taller, darker and sway further. */
function Grass({
  seed,
  count,
  baseY,
  height,
  fill,
  opacity,
  sway,
  spread = 1000,
}: {
  seed: number;
  count: number;
  baseY: number;
  height: number;
  fill: string;
  opacity: number;
  sway: string;
  spread?: number;
}) {
  const rand = rng(seed);
  const blades: string[] = [];
  for (let i = 0; i < count; i++) {
    const x = rand() * spread;
    const h = height * (0.55 + rand() * 0.85);
    const lean = (rand() - 0.5) * h * 0.8;
    const w = 1.1 + rand() * 1.5;
    // A blade is a quadratic curve so it tapers and bends rather than being
    // a straight spike.
    blades.push(
      `M${x.toFixed(1)} ${baseY} q${(lean * 0.35).toFixed(1)} ${(-h * 0.6).toFixed(1)} ${lean.toFixed(1)} ${(-h).toFixed(1)} l${w.toFixed(1)} ${(h * 0.12).toFixed(1)} q${(-lean * 0.3).toFixed(1)} ${(h * 0.55).toFixed(1)} ${(-lean * 0.6).toFixed(1)} ${h.toFixed(1)} z`
    );
  }
  return (
    <g className={sway} style={{ transformOrigin: `50% ${baseY}px` }}>
      <path d={blades.join(" ")} fill={fill} opacity={opacity} />
    </g>
  );
}

export default function Backdrop() {
  // Visible by DEFAULT, hidden only if the file genuinely fails.
  //
  // The first version faded in on canplay, and a cached video was routinely
  // ready before React attached the handler — so the event never arrived and
  // the clip played at opacity 0, perfectly and invisibly, behind everything.
  // Starting visible removes that race: the poster frame covers the decode
  // window, and the drawn scene is revealed only on a real error.
  const [videoFailed, setVideoFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    // Do NOT rely on onCanPlay alone. A cached video is often already ready
    // before React attaches the handler, so the event never arrives and the
    // clip plays at opacity 0 behind everything — playing perfectly and
    // completely invisible. Check the state we already have, then listen.
    // Muted autoplay is allowed nearly everywhere, but where it is refused the
    // poster frame stays up as a still — the same house, not a black box — and
    // the first gesture anywhere on the page starts it.
    const tryPlay = () => void el.play().catch(() => { /* poster stands in */ });
    tryPlay();
    window.addEventListener("pointerdown", tryPlay, { once: true });
    window.addEventListener("keydown", tryPlay, { once: true });
    return () => {
      window.removeEventListener("pointerdown", tryPlay);
      window.removeEventListener("keydown", tryPlay);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        overflow: "hidden",
        background: "#05070b",
      }}
    >
      <style>{`
        @keyframes nod-sway-a { 0%,100% { transform: skewX(0deg); } 50% { transform: skewX(1.6deg); } }
        @keyframes nod-sway-b { 0%,100% { transform: skewX(0.5deg); } 50% { transform: skewX(-2.2deg); } }
        @keyframes nod-sway-c { 0%,100% { transform: skewX(-0.6deg); } 50% { transform: skewX(2.9deg); } }
        @keyframes nod-drift { from { transform: translateX(-14%); } to { transform: translateX(14%); } }
        @keyframes nod-drift-b { from { transform: translateX(12%); } to { transform: translateX(-12%); } }
        /* Not a steady blink — it gutters, like something is walking past it. */
        @keyframes nod-gutter {
          0%, 42%, 46%, 100% { opacity: 0.85; }
          44% { opacity: 0.28; }
          62% { opacity: 0.62; }
          70% { opacity: 0.92; }
        }
        @keyframes nod-gutter-slow {
          0%, 100% { opacity: 0.5; }
          33% { opacity: 0.72; }
          58% { opacity: 0.38; }
        }
        .nod-sway-a { animation: nod-sway-a 9s ease-in-out infinite; }
        .nod-sway-b { animation: nod-sway-b 7s ease-in-out infinite; }
        .nod-sway-c { animation: nod-sway-c 5.5s ease-in-out infinite; }
        .nod-fog   { animation: nod-drift 46s ease-in-out infinite alternate; }
        .nod-fog-b { animation: nod-drift-b 34s ease-in-out infinite alternate; }
        .nod-win   { animation: nod-gutter 11s ease-in-out infinite; }
        .nod-win-b { animation: nod-gutter-slow 8s ease-in-out infinite; }
        /* Someone who has asked for less motion should not be given a
           swaying field and a guttering window. */
        /* The viewBox is wide and the crop is "slice", so on a phone the
           visible window narrows to roughly the middle quarter — which left
           the house almost entirely off the right edge. Pull it back toward
           the centre and shrink it there. transform-box/origin make the CSS
           transform behave like the SVG transform attribute it replaces. */
        .nod-house { transform-box: view-box; transform-origin: 0 0;
                     transform: translate(596px, 214px) scale(0.62); }
        .nod-moon-a { transform-box: view-box; transform-origin: 0 0; }
        @media (max-width: 780px) {
          .nod-house { transform: translate(432px, 238px) scale(0.5); }
          .nod-moon-a { transform: translate(-176px, 22px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .nod-sway-a, .nod-sway-b, .nod-sway-c,
          .nod-fog, .nod-fog-b, .nod-win, .nod-win-b { animation: none; }
          /* A looping video is motion too. Fall back to the still drawing. */
          .nod-video { display: none; }
        }
      `}</style>

      {/*
        The filmed house. It sits ON TOP of the drawn scene rather than
        replacing it, so the SVG is what you look at while this downloads,
        if it fails to decode, or if autoplay is refused — there is never a
        black rectangle where the background should be.
      */}
      <video
        ref={videoRef}
        src="/video/house.mp4"
        poster="/video/house-poster.jpg"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        onError={() => setVideoFailed(true)}
        className="nod-video"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          opacity: videoFailed ? 0 : 1,
          transition: "opacity 0.8s ease",
          // The drawn scene is authored AFTER this in the DOM so it can act as
          // the fallback, which means its opaque sky would otherwise paint
          // straight over the film. Lift the video above it explicitly.
          zIndex: 1,
        }}
      />

      <svg
        viewBox="0 0 1000 560"
        preserveAspectRatio="xMidYMax slice"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      >
        <defs>
          <linearGradient id="nod-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#05070c" />
            <stop offset="42%" stopColor="#101724" />
            <stop offset="66%" stopColor="#1b2534" />
            <stop offset="84%" stopColor="#141d29" />
            <stop offset="100%" stopColor="#0c1119" />
          </linearGradient>
          <radialGradient id="nod-moon" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor="#cdd8e4" stopOpacity="0.5" />
            <stop offset="35%" stopColor="#8d9cb0" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#8d9cb0" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="nod-glow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor="#ffd79a" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#ffd79a" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="nod-haze" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1b2430" stopOpacity="0" />
            <stop offset="60%" stopColor="#1b2430" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#1b2430" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="nod-ground" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0d131b" />
            <stop offset="100%" stopColor="#04060a" />
          </linearGradient>
        </defs>

        <rect width="1000" height="560" fill="url(#nod-sky)" />

        {/* A moon low and behind the house, so the roofline is backlit and the
            windows are the only warm thing in the frame. */}
        <g className="nod-moon-a">
          <circle cx="690" cy="176" r="170" fill="url(#nod-moon)" />
          <circle cx="690" cy="176" r="17" fill="#c3cedb" opacity="0.3" />
        </g>

        {/* Treeline. Kept very close to the sky value — it should be felt as a
            horizon rather than seen as trees. */}
        <g fill="#070a11" opacity="0.55">
          <path d="M0 352 l26 -28 14 18 22 -34 18 26 26 -20 20 26 30 -38 22 34 26 -22 18 26 24 -16 22 20 18 -24 20 28 V400 H0 Z" />
          <path d="M760 356 l22 -26 18 22 24 -32 22 30 20 -20 18 24 24 -28 22 30 24 -18 22 22 V400 H760 Z" />
        </g>

        {/* ── The house ──
            Small in frame and set back behind two banks of haze. Nothing about
            it is symmetrical: the tower is off-centre, the porch roof sags and
            the chimneys lean apart. */}
        <g className="nod-house">
          <g fill="#070a10">
            {/* main block */}
            <rect x="30" y="88" width="150" height="120" />
            {/* steep gable */}
            <path d="M22 92 L105 24 L188 92 Z" />
            {/* tower, off to one side and taller than it should be */}
            <rect x="150" y="52" width="52" height="156" />
            <path d="M142 58 L176 8 L210 58 Z" />
            {/* lower wing */}
            <rect x="0" y="132" width="42" height="76" />
            <path d="M-6 136 L21 108 L48 136 Z" />
            {/* sagging porch */}
            <path d="M34 150 L128 150 L124 162 L38 164 Z" />
            {/* chimneys, leaning away from each other */}
            <rect x="58" y="44" width="12" height="48" transform="rotate(-3 64 68)" />
            <rect x="128" y="52" width="10" height="42" transform="rotate(4 133 73)" />
          </g>

          {/* Lit windows. Two gutter, the rest are dead. */}
          <g>
            <rect className="nod-win" x="52" y="112" width="14" height="20" fill="#f0b871" />
            <rect className="nod-win-b" x="164" y="86" width="13" height="19" fill="#e8a95f" />
            <rect x="96" y="114" width="14" height="20" fill="#1d222b" />
            <rect x="140" y="116" width="12" height="18" fill="#1d222b" />
            <rect x="60" y="168" width="13" height="22" fill="#191d25" />
            <rect x="164" y="140" width="13" height="20" fill="#171b23" />
            {/* the one in the tower, near the top */}
            <rect className="nod-win-b" x="170" y="34" width="11" height="15" fill="#d99a52" />
          </g>
          {/* Warmth bleeding out of the lit ones */}
          <ellipse className="nod-win" cx="59" cy="122" rx="42" ry="30" fill="url(#nod-glow)" opacity="0.5" />
          <ellipse className="nod-win-b" cx="175" cy="40" rx="34" ry="26" fill="url(#nod-glow)" opacity="0.42" />
        </g>

        {/* Haze bank BEHIND the grass — this is what sets the house back */}
        <g className="nod-fog" opacity="0.85">
          <rect x="-160" y="300" width="1320" height="110" fill="url(#nod-haze)" />
        </g>

        <rect y="352" width="1000" height="210" fill="url(#nod-ground)" />

        {/* ── The field ──
            Three depths. Each is smaller, lighter and slower than the one in
            front of it, which is what sells distance across flat colour. */}
        <Grass seed={11} count={190} baseY={392} height={26} fill="#0b1119" opacity={0.95} sway="nod-sway-a" />

        <g className="nod-fog-b" opacity="0.7">
          <rect x="-140" y="360" width="1280" height="90" fill="url(#nod-haze)" />
        </g>

        <Grass seed={29} count={150} baseY={452} height={52} fill="#070c12" opacity={0.97} sway="nod-sway-b" />
        {/* A dead tree at the edge of the field. The field is all texture and
            no shape; this gives the eye one hard silhouette to land on. */}
        <g fill="#02040800" stroke="#02040a" strokeWidth="3.4" strokeLinecap="round" opacity="0.96">
          <path d="M92 552 L98 452" strokeWidth="7" />
          <path d="M97 486 L64 452 M97 486 L60 470" />
          <path d="M98 470 L132 438 M98 470 L136 458" />
          <path d="M99 452 L78 418 M99 452 L118 420 M99 452 L101 410" />
          <path d="M80 420 L66 402 M118 421 L134 404" strokeWidth="2.2" />
        </g>

        <Grass seed={47} count={110} baseY={548} height={104} fill="#03050a" opacity={1} sway="nod-sway-c" />
      </svg>

      {/* Vignette and a final wash of dark, so the title text always has
          something quiet to sit on regardless of viewport. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 2, // above both the film and the drawing
          background:
            "radial-gradient(ellipse at 50% 46%, rgba(5,7,11,0.10) 0%, rgba(5,7,11,0.42) 52%, rgba(3,5,8,0.88) 100%)",
        }}
      />
    </div>
  );
}
