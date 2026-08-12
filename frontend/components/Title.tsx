"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount, useChainId, useConnect, usePublicClient, useSwitchChain, useWalletClient } from "wagmi";
import { activeChain } from "@/lib/network";
import { HouseLink, HOUSE_ADDRESS } from "@/game/chain";
import Backdrop from "./Backdrop";

type Phase = "title" | "connecting" | "waking" | "verified" | "playing" | "error";

/** One line of the end-to-end wallet check shown before the run starts. */
type Check = { label: string; detail: string; ok: boolean };

const shell: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "1.1rem",
  color: "#c3cbd8",
  fontFamily: "Georgia, serif",
  fontWeight: 700,
  // The background is film now, not a flat fill. Weight alone is not enough —
  // text needs its own shadow to hold against whatever frame is behind it.
  textShadow: "0 2px 14px rgba(0,0,0,0.95), 0 0 4px rgba(0,0,0,0.8)",
  textAlign: "center",
  padding: "2rem",
  // The controls panel makes this screen taller than a short laptop window,
  // and a fixed full-bleed flex container clips instead of scrolling.
  overflowY: "auto",
};

const button: React.CSSProperties = {
  marginTop: "1.6rem",
  padding: "0.7rem 2.2rem",
  color: "#dbe3d2",
  border: "1px solid rgba(210,220,200,0.5)",
  fontFamily: "Georgia, serif",
  fontWeight: 700,
  fontSize: "0.95rem",
  letterSpacing: "0.18em",
  cursor: "pointer",
  // Buttons do not inherit text-shadow — the UA stylesheet blocks it — and
  // these sit directly over moving footage, so they need it most.
  textShadow: "0 2px 14px rgba(0,0,0,0.95), 0 0 4px rgba(0,0,0,0.8)",
  // A little backing so a bright frame behind them cannot swallow the label
  backdropFilter: "blur(2px)",
  background: "rgba(6,8,12,0.32)",
};

/** Shown on the title screen. Keep in step with Input and README. */
const CONTROLS: [string, string][] = [
  ["A  D", "move. he is eight — he does not move quickly"],
  ["Shift", "run. faster, and much louder"],
  ["C", "sneak. slow and quiet, and you stay low"],
  ["E", "interact — take, open, read, hide, climb, come out"],
  ["Q", "throw what you are carrying, to make a noise elsewhere"],
  ["F", "torch on and off. it has a battery, and the dark is safer"],
];

export default function Title() {
  const [phase, setPhase] = useState<Phase>("title");
  const [message, setMessage] = useState("");
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<{ dispose: () => void } | null>(null);
  /** Set when a run is ready to start; `link: null` means play without the chain. */
  const [startWith, setStartWith] = useState<{ link: HouseLink | null } | null>(null);
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const fadeRef = useRef<((to: number, seconds: number, thenPause?: boolean) => void) | null>(null);
  const handOverRef = useRef<(() => void) | null>(null);
  /** Guards against beginRun being entered twice as wagmi's values land. */
  const startedRef = useRef(false);
  /** The name he goes by. Kept for the memorial and the end-of-run card. */
  const [playerName, setPlayerName] = useState("");
  /** Every hop from wallet to gameplay, shown before you are let in. */
  const [checks, setChecks] = useState<Check[]>([]);
  const [showControls, setShowControls] = useState(false);
  /** True until the game reports its first drawn frame. */
  const [booting, setBooting] = useState(false);
  const linkRef = useRef<HouseLink | null>(null);

  const { address, isConnected } = useAccount();
  const { connect, connectors, error: connectError } = useConnect();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  // Tear the game down if this component ever unmounts
  useEffect(() => () => gameRef.current?.dispose(), []);

  /**
   * The music box on the title screen.
   *
   * Browsers refuse to autoplay audio until the visitor has interacted with
   * the page, so we try immediately and then retry on the first gesture of
   * any kind. It fades in rather than snapping on, and fades out when the run
   * begins — from that point the in-game engine owns the sound.
   */
  useEffect(() => {
    const el = new Audio("/audio/title-box.mp3");
    el.loop = true;
    el.volume = 0;
    musicRef.current = el;
    // A bare Audio() is invisible to the DOM, which makes sound impossible to
    // verify from the console. Expose it outside production builds only.
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as { __titleMusic?: HTMLAudioElement }).__titleMusic = el;
    }

    let raf = 0;
    const fade = (to: number, seconds: number, thenPause = false) => {
      cancelAnimationFrame(raf);
      const from = el.volume;
      const t0 = performance.now();
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / (seconds * 1000));
        el.volume = from + (to - from) * k;
        if (k < 1) raf = requestAnimationFrame(step);
        else if (thenPause) el.pause();
      };
      raf = requestAnimationFrame(step);
    };
    fadeRef.current = fade;

    // Clicking WAKE UP is itself a pointerdown, so without this guard the
    // gesture handler restarts the fade-in and cancels the hand-over — the
    // box would keep playing straight over the game.
    let handedOver = false;
    const start = () => {
      if (handedOver) return;
      el.play().then(() => { if (!handedOver) fade(0.5, 4); }).catch(() => {
        /* still blocked — the next gesture will try again */
      });
    };
    start();
    window.addEventListener("pointerdown", start);
    window.addEventListener("keydown", start);

    handOverRef.current = () => {
      handedOver = true;
      window.removeEventListener("pointerdown", start);
      window.removeEventListener("keydown", start);
      fade(0, 2.2, true);
    };

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointerdown", start);
      window.removeEventListener("keydown", start);
      el.pause();
    };
  }, []);

  // Hand the sound over to the game when the run starts
  useEffect(() => {
    if (phase === "playing") handOverRef.current?.();
  }, [phase]);

  /**
   * Build the game once the host div is actually on screen. This has to be an
   * effect rather than a requestAnimationFrame callback in the click handler:
   * a backgrounded or non-compositing tab throttles rAF to a standstill, and
   * the game would simply never be constructed.
   */
  useEffect(() => {
    if (phase !== "playing" || !startWith || gameRef.current || !hostRef.current) return;
    let cancelled = false;
    void (async () => {
      const { NodGame } = await import("@/game/game");
      if (cancelled || gameRef.current || !hostRef.current) return;
      const g = new NodGame(hostRef.current, startWith.link, playerName.trim());
      // The spinner comes down on the first DRAWN frame, not on the
      // constructor returning — building the floor and compiling shaders
      // happen after construction, and that gap is the black rectangle.
      g.onReady = () => setBooting(false);
      gameRef.current = g;
    })();
    return () => { cancelled = true; };
  }, [phase, startWith, playerName]);

  async function wake() {
    startedRef.current = false; // so TRY AGAIN genuinely tries again
    setPhase("connecting");
    setMessage("");
    try {
      if (!isConnected) {
        const injected = connectors[0];
        if (!injected) throw new Error("no wallet found in this browser");
        connect({ connector: injected });
        setMessage("waiting for your wallet…");
        return; // the effect below picks it up once connected
      }
      await beginRun();
    } catch (err: unknown) {
      setPhase("error");
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * Carry on into the house once wagmi has everything.
   *
   * `address` MUST be in these dependencies. It arrives on a different tick
   * from `walletClient`, and beginRun needs all three — without it the effect
   * fired once while address was still undefined, beginRun returned, and
   * nothing ever re-ran it. That is the "connected but stuck on verifying"
   * hang: no error, no retry, forever.
   */
  useEffect(() => {
    if (phase !== "connecting") return;
    if (!isConnected || !walletClient || !publicClient || !address) return;
    if (startedRef.current) return;
    startedRef.current = true;
    void beginRun();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, isConnected, walletClient, publicClient, address]);

  // A rejected or ignored wallet prompt must not hang the screen either.
  useEffect(() => {
    if (phase !== "connecting") return;
    const bail = setTimeout(() => {
      if (!startedRef.current) {
        setPhase("error");
        setMessage(
          connectError?.message ??
            "the wallet never answered. check it is unlocked and on base sepolia, or go in without being remembered."
        );
      }
    }, 25000);
    return () => clearTimeout(bail);
  }, [phase, connectError]);

  /**
   * Play with no chain at all. The house still works — it just does not
   * remember you, and the floors below are not sealed against you. This has
   * to exist: without it, anyone with no wallet, no testnet ether or the
   * wrong network simply cannot play the game.
   */
  function startOffline() {
    setStartWith({ link: null });
    setBooting(true);
    setPhase("playing");
  }

  async function beginRun() {
    // Never return silently from here — the caller has already put the screen
    // into a waiting state, so bailing without saying why is what left it
    // hanging on "verifying" in the first place.
    if (!walletClient || !publicClient || !address) {
      startedRef.current = false;
      setPhase("error");
      setMessage("the wallet connected but never handed over an account.");
      return;
    }
    setPhase("waking");

    // Each hop from wallet to gameplay, checked and shown. "Connected" on its
    // own proves almost nothing: you can be connected to the wrong chain, to a
    // house that was never sealed, or holding an account the contract has
    // never heard of. Each line below is a thing that can independently fail.
    const found: Check[] = [];
    const push = (label: string, detail: string, ok = true) => {
      found.push({ label, detail, ok });
      setChecks([...found]);
    };

    try {
      push("wallet", `${address.slice(0, 6)}…${address.slice(-4)}`);

      if (chainId !== activeChain.id) {
        setMessage("this house is on base sepolia…");
        await switchChainAsync({ chainId: activeChain.id });
      }
      push("network", activeChain.name);

      if (!HOUSE_ADDRESS) throw new Error("the house has no address configured");
      const link = new HouseLink(publicClient as never, walletClient, address);

      const sealed = await link.isSealed();
      if (!sealed) throw new Error("this house has not been sealed yet");
      push("house", `${HOUSE_ADDRESS.slice(0, 8)}… sealed`);

      // A run that is already underway is resumed rather than restarted.
      const run = await link.runState();
      if (!run.active) {
        setMessage("the house learns your name…");
        await link.enterHouse();
        push("run", "entered — floor 7");
      } else {
        push("run", `resumed — floor ${run.floor}`);
      }

      // Proof the encrypted layer is actually reachable for THIS wallet, not
      // just that the contract exists: the seed for the floor you are about to
      // stand on was minted by the TEE and granted to you alone.
      try {
        const seed = await link.floorSeed(run.active ? run.floor : 7);
        push("encrypted seed", seed === null ? "granted, not yet resolved" : "resolved for this wallet");
      } catch {
        push("encrypted seed", "unreadable — the floor will use a local layout", false);
      }

      linkRef.current = link;
      setPhase("verified");
    } catch (err: unknown) {
      startedRef.current = false;
      setPhase("error");
      const raw = err instanceof Error ? err.message : String(err);
      setMessage(raw.length > 160 ? raw.slice(0, 160) + "…" : raw);
    }
  }

  /** Called from the verified screen — this is the actual door. */
  function enterVerified() {
    setStartWith({ link: linkRef.current });
    setBooting(true);
    setPhase("playing");
  }

  if (phase === "playing") {
    return (
      <>
        <div
          ref={hostRef}
          style={{ position: "fixed", inset: 0, background: "#07090d", overflow: "hidden" }}
        />
        {/* Sits OVER the live canvas and fades out on the first drawn frame,
            so the player never stares at an undecorated black rectangle
            wondering whether their click registered. */}
        <div
          style={{
            ...shell,
            pointerEvents: booting ? "auto" : "none",
            opacity: booting ? 1 : 0,
            transition: "opacity 0.9s ease",
          }}
        >
          <p style={{ letterSpacing: "0.5em", fontSize: "1.1rem", opacity: 0.9, margin: 0 }}>
            N O D
          </p>
          <p style={{ opacity: 0.7, fontStyle: "italic", fontSize: "0.88rem", marginTop: "1.4rem" }}>
            the house is being built around you…
          </p>
          <div style={{ width: "13rem", height: 1, background: "rgba(200,210,190,0.12)", marginTop: "1.6rem", overflow: "hidden" }}>
            <div style={{ width: "40%", height: "100%", background: "rgba(200,210,190,0.5)", animation: "nodslide 1.5s ease-in-out infinite" }} />
          </div>
          <style>{"@keyframes nodslide{0%{transform:translateX(-110%)}100%{transform:translateX(320%)}}"}</style>
        </div>
      </>
    );
  }

  return (
    <>
      <Backdrop />
      <main style={{ ...shell, position: "fixed", zIndex: 1 }}>
      <h1 style={{ fontWeight: 800, letterSpacing: "0.55em", fontSize: "2.2rem", margin: 0 }}>
        N O D
      </h1>
      <p style={{ opacity: 0.8, fontStyle: "italic", fontSize: "0.95rem", margin: 0 }}>
        the stairs only go down
      </p>

      {phase === "title" && (
        <>
          <p style={{ opacity: 0.72, fontSize: "0.82rem", maxWidth: "34rem", lineHeight: 1.9 }}>
            you are eight years old and this is not your house.
            <br />
            other children woke here before you. some of them are still here.
          </p>
          {/* He has to be called something. It goes on the memorial. */}
          <input
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value.slice(0, 18))}
            placeholder="what shall the house call you?"
            spellCheck={false}
            style={{
              marginTop: "1.2rem", padding: "0.6rem 1rem", width: "min(22rem, 80vw)",
              background: "rgba(255,255,255,0.03)", color: "#c8d2be", textAlign: "center",
              border: "1px solid rgba(200,210,190,0.22)", fontFamily: "Georgia, serif",
              fontSize: "0.9rem", letterSpacing: "0.06em", outline: "none",
            }}
          />

          <button style={button} onClick={() => void wake()}>
            WAKE UP
          </button>
          <p style={{ opacity: 0.6, fontSize: "0.7rem", marginTop: "0.6rem" }}>
            the house needs a wallet to learn your name — base sepolia
          </p>
          <button
            style={{
              ...button, marginTop: "0.8rem", fontSize: "0.78rem",
              letterSpacing: "0.12em", opacity: 0.72, borderColor: "rgba(200,210,190,0.18)",
            }}
            onClick={startOffline}
          >
            WAKE UP WITHOUT BEING REMEMBERED
          </button>

          <button
            onClick={() => setShowControls((v) => !v)}
            style={{
              ...button, marginTop: "1.6rem", fontSize: "0.72rem", padding: "0.4rem 1.2rem",
              letterSpacing: "0.2em", opacity: 0.7, border: "none",
              textDecoration: "underline", textUnderlineOffset: "0.4rem",
            }}
          >
            {showControls ? "CLOSE" : "HOW TO PLAY"}
          </button>

          {showControls && (
            <div
              style={{
                marginTop: "1.2rem", padding: "1.4rem 1.6rem",
                border: "1px solid rgba(200,210,190,0.16)",
                background: "rgba(255,255,255,0.02)",
                width: "min(34rem, 90vw)", textAlign: "left",
              }}
            >
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                <tbody>
                  {CONTROLS.map(([k, what]) => (
                    <tr key={k}>
                      <td
                        style={{
                          padding: "0.42rem 0.9rem 0.42rem 0", width: "5.5rem",
                          verticalAlign: "top",
                        }}
                      >
                        <span
                          style={{
                            display: "inline-block", minWidth: "2.1rem", textAlign: "center",
                            padding: "0.18rem 0.45rem", color: "#d8e0cc",
                            border: "1px solid rgba(200,210,190,0.4)",
                            fontFamily: "ui-monospace, Menlo, monospace", fontSize: "0.76rem",
                          }}
                        >
                          {k}
                        </span>
                      </td>
                      <td style={{ padding: "0.42rem 0", opacity: 0.8, lineHeight: 1.5 }}>{what}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ opacity: 0.68, fontSize: "0.76rem", lineHeight: 1.8, marginTop: "1.1rem", marginBottom: 0 }}>
                every floor is held by something that hunts by <em>one</em> sense. work out
                which, and what denies it. find the key, open the stairs, go down.
                <br />
                on the top floor, hiding always works. it stops being that simple.
              </p>
            </div>
          )}
        </>
      )}

      {phase === "verified" && (
        <>
          <p style={{ opacity: 0.78, fontSize: "0.86rem", marginTop: "1.2rem", marginBottom: 0 }}>
            the house has you{playerName.trim() ? `, ${playerName.trim()}` : ""}.
          </p>
          <div
            style={{
              marginTop: "1.2rem", padding: "1.1rem 1.4rem", textAlign: "left",
              border: "1px solid rgba(200,210,190,0.16)",
              background: "rgba(255,255,255,0.02)", width: "min(30rem, 90vw)",
            }}
          >
            {checks.map((c) => (
              <div
                key={c.label}
                style={{
                  display: "flex", justifyContent: "space-between", gap: "1rem",
                  padding: "0.3rem 0", fontSize: "0.8rem",
                }}
              >
                <span style={{ opacity: 0.7 }}>
                  {c.ok ? "✓" : "!"} {c.label}
                </span>
                <span style={{ opacity: 0.9, color: c.ok ? "#c8d2be" : "#c9a06a", textAlign: "right" }}>
                  {c.detail}
                </span>
              </div>
            ))}
          </div>
          <button style={button} onClick={enterVerified}>
            GO DOWN
          </button>
        </>
      )}

      {(phase === "connecting" || phase === "waking") && (
        <p style={{ opacity: 0.78, fontStyle: "italic", fontSize: "0.9rem", marginTop: "1.5rem" }}>
          {message || "…"}
        </p>
      )}

      {phase === "error" && (
        <>
          <p style={{ opacity: 0.82, fontSize: "0.85rem", maxWidth: "32rem", lineHeight: 1.8 }}>
            {message}
          </p>
          <button style={button} onClick={() => void wake()}>
            TRY AGAIN
          </button>
          {/* A failed handshake must never be a dead end */}
          <button
            style={{
              ...button, marginTop: "0.8rem", fontSize: "0.78rem",
              letterSpacing: "0.12em", opacity: 0.72, borderColor: "rgba(200,210,190,0.18)",
            }}
            onClick={startOffline}
          >
            GO IN ANYWAY
          </button>
        </>
      )}
      </main>
    </>
  );
}
