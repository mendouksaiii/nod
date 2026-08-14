"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount, useConnect, useDisconnect, usePublicClient, useSwitchChain } from "wagmi";
import { activeChain } from "@/lib/network";
import { getWalletClient } from "@wagmi/core";
import { HouseLink, HOUSE_ADDRESS } from "@/game/chain";
import { wagmiConfig } from "./Providers";
import Backdrop from "./Backdrop";

type Phase = "title" | "choose" | "connecting" | "naming" | "waking" | "verified" | "playing" | "error";

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
  /** Which door led to the naming screen — the chain, or offline. */
  const namingThenRef = useRef<"online" | "offline">("online");
  /** The name he goes by. Kept for the memorial and the end-of-run card. */
  const [playerName, setPlayerName] = useState("");
  /** Every hop from wallet to gameplay, shown before you are let in. */
  const [checks, setChecks] = useState<Check[]>([]);
  const [showControls, setShowControls] = useState(false);
  /** True until the game reports its first drawn frame. */
  const [booting, setBooting] = useState(false);
  const linkRef = useRef<HouseLink | null>(null);

  // chainId comes from useAccount, NOT useChainId. useChainId returns the
  // CONFIG's chain (always base sepolia here), so comparing against it always
  // said "already on the right chain" and skipped the switch — then the signer
  // fetch failed because the wallet was really on mainnet. useAccount().chainId
  // is the wallet's ACTUAL chain, which is the thing that has to be switched.
  const { address, isConnected, connector: activeConnector, chainId } = useAccount();
  const { connect, connectors, error: connectError } = useConnect();
  const { disconnectAsync } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();
  const publicClient = usePublicClient();

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

  /**
   * The wallets worth offering.
   *
   * The generic `injected` entry is a shim for whatever claimed window.ethereum
   * and duplicates a named wallet in the list whenever discovery worked, so it
   * is only offered when nothing announced itself.
   */
  function pickable(list: readonly typeof connectors[number][]) {
    const named = list.filter((c) => c.id !== "injected");
    return named.length ? named : list.slice();
  }

  /** Ask one specific wallet, and say which one is being asked. */
  async function connectWith(target: (typeof connectors)[number]) {
    startedRef.current = false;
    setPhase("connecting");
    setMessage(`asking ${target.name}…`);

    // If a stale wallet is already connected — the persisted one from a failed
    // attempt, often the WRONG chain's wallet — connecting a different one
    // silently no-ops in wagmi. Drop the old session first so the new choice
    // actually takes. Choosing the already-connected wallet just proceeds.
    if (isConnected && activeConnector?.uid !== target.uid) {
      await disconnectAsync().catch(() => {});
    } else if (isConnected && activeConnector?.uid === target.uid) {
      setMessage("waiting for your wallet…");
      return; // the effect below already has this connection
    }

    // connect() is fire-and-forget in wagmi v2 — a rejection lands in
    // connectError, not here — so the failure path is wired explicitly.
    connect(
      { connector: target },
      {
        onError: (e) => {
          setPhase("error");
          setMessage(
            /reject|denied|user/i.test(e.message)
              ? "you closed the wallet. nothing has been signed."
              : e.message
          );
        },
      }
    );
  }

  async function wake() {
    startedRef.current = false; // so TRY AGAIN genuinely tries again
    namingThenRef.current = "online";
    setPhase("connecting");
    setMessage("");
    try {
      // Ask which wallet. Do not guess, and do NOT gate this on !isConnected.
      //
      // Every automatic pick here has been wrong for somebody. window.ethereum
      // rejected wallets that only announce over EIP-6963; then "prefer a
      // discovered wallet over the generic injected shim" grabbed the FIRST
      // announced one, which on a machine with five wallets installed was
      // Keplr — a Cosmos wallet — being asked for a Base Sepolia account.
      //
      // And gating on !isConnected meant that once that wrong wallet was
      // connected, wagmi PERSISTED it: on the next load isConnected was already
      // true, so the picker was skipped and the stale Keplr session was reused
      // forever with no way to change it. So the picker must be reachable even
      // when something is already connected.
      const usable = pickable(connectors);
      if (!usable.length) {
        throw new Error(
          "no wallet found in this browser. install one, or go in without being remembered."
        );
      }
      // One wallet, already connected: nothing to choose, go straight through.
      if (usable.length === 1 && isConnected) {
        setMessage("waiting for your wallet…");
        return;
      }
      if (usable.length === 1) {
        void connectWith(usable[0]);
        return;
      }
      // More than one wallet: always let the person choose, even if a stale
      // one is connected. The keyboard knows which they meant; nobody else does.
      //
      // Once a wallet is chosen and connected, the effect below is the single
      // entry point into beginRun: it waits for isConnected, walletClient,
      // publicClient and address to all land (they arrive on different ticks),
      // and the watchdog underneath covers the case where they never do.
      setPhase("choose");
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
    // Deliberately does NOT wait for walletClient. That hook stays undefined
    // for a wallet on the wrong chain, which is the common case and used to
    // deadlock here: the chain switch lives in beginRun, but beginRun was
    // gated on the very client the wrong chain could never produce. address is
    // available the moment you connect, on any chain — that is enough to move
    // on and do the switch ourselves.
    if (!isConnected || !publicClient || !address) return;
    if (startedRef.current) return;
    startedRef.current = true;
    // The name is asked for HERE, once the wallet is actually in hand — not on
    // the title screen. It goes on the on-chain memorial via enterHouse, so it
    // has to be captured before that call, and it reads better to be asked
    // "what shall the house call you" the moment the house has hold of you.
    setPhase("naming");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, isConnected, publicClient, address]);

  // Any connector error ends the wait at once. Previously this was only read
  // by the watchdog below, so a wallet that refused instantly still left the
  // screen sitting on "waiting for your wallet…" for the full 25 seconds.
  useEffect(() => {
    if (phase !== "connecting" || !connectError) return;
    setPhase("error");
    setMessage(
      /reject|denied|user/i.test(connectError.message)
        ? "you closed the wallet. nothing has been signed."
        : connectError.message
    );
  }, [phase, connectError]);

  // A prompt that is opened and then ignored must not hang the screen either.
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
    }, 12000);
    return () => clearTimeout(bail);
  }, [phase, connectError]);

  /**
   * Play with no chain at all. The house still works — it just does not
   * remember you, and the floors below are not sealed against you. This has
   * to exist: without it, anyone with no wallet, no testnet ether or the
   * wrong network simply cannot play the game.
   */
  /** The offline door also asks for a name first — it is used in-game and on
   *  the end-of-run card even when nothing is written to the chain. */
  function startOffline() {
    namingThenRef.current = "offline";
    setPhase("naming");
  }

  /** Boot with no chain, after the name has been given. */
  function beginOffline() {
    setStartWith({ link: null });
    setBooting(true);
    setPhase("playing");
  }

  /** The continue button on the naming screen runs whichever door led here. */
  function nameGiven() {
    if (namingThenRef.current === "offline") beginOffline();
    else void beginRun();
  }

  async function beginRun() {
    // Never return silently from here — the caller has already put the screen
    // into a waiting state, so bailing without saying why is what left it
    // hanging on "verifying" in the first place.
    // Note: walletClient is NOT required here. It is fetched imperatively
    // below, AFTER the chain is switched, because the hook value stays
    // undefined until the wallet is on a configured chain.
    if (!publicClient || !address) {
      startedRef.current = false;
      setPhase("error");
      setMessage(
        `the wallet connected but never handed over ${!address ? "an account" : "an rpc connection"}.`
      );
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
        setMessage("this house is on base sepolia — approve the switch…");
        await switchChainAsync({ chainId: activeChain.id });
      }
      push("network", activeChain.name);

      // NOW fetch the signer, once we are provably on the right chain. This is
      // the imperative equivalent of the useWalletClient hook, and it is what
      // unwedges a wallet that connected on Ethereum mainnet: the hook could
      // never build a client for that chain, but after the switch this can.
      const signer = await getWalletClient(wagmiConfig, { chainId: activeChain.id });
      if (!signer) {
        throw new Error(
          "the wallet is connected but would not hand over a signer for base sepolia. check it is unlocked."
        );
      }
      push("signer", "ready");

      if (!HOUSE_ADDRESS) throw new Error("the house has no address configured");
      const link = new HouseLink(publicClient as never, signer, address);

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

      {phase === "naming" && (
        <>
          <p style={{ opacity: 0.8, fontSize: "0.9rem", marginTop: "1.2rem", maxWidth: "28rem", lineHeight: 1.8 }}>
            {namingThenRef.current === "offline"
              ? "the house will not remember you. still —"
              : "the house has hold of you now."}
          </p>
          <input
            value={playerName}
            autoFocus
            onChange={(e) => setPlayerName(e.target.value.slice(0, 18))}
            onKeyDown={(e) => { if (e.key === "Enter" && playerName.trim()) nameGiven(); }}
            placeholder="what shall the house call you?"
            spellCheck={false}
            style={{
              marginTop: "0.6rem", padding: "0.6rem 1rem", width: "min(22rem, 80vw)",
              background: "rgba(255,255,255,0.04)", color: "#c8d2be", textAlign: "center",
              border: "1px solid rgba(200,210,190,0.28)", fontFamily: "Georgia, serif",
              fontSize: "0.95rem", letterSpacing: "0.06em", outline: "none",
            }}
          />
          <button
            style={{ ...button, opacity: playerName.trim() ? 1 : 0.4 }}
            disabled={!playerName.trim()}
            onClick={() => nameGiven()}
          >
            STEP INSIDE
          </button>
          {namingThenRef.current === "online" && (
            <p style={{ opacity: 0.5, fontSize: "0.7rem", marginTop: "0.7rem", maxWidth: "24rem", lineHeight: 1.7 }}>
              this name is sealed to the floor you fall on, encrypted. only a
              child who reaches it can read it.
            </p>
          )}
        </>
      )}

      {phase === "choose" && (
        <>
          <p style={{ opacity: 0.78, fontSize: "0.86rem", marginTop: "1.2rem" }}>
            which wallet?
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.4rem" }}>
            {pickable(connectors).map((c) => {
              const isActive = isConnected && activeConnector?.uid === c.uid;
              return (
                <button
                  key={c.uid}
                  style={{ ...button, marginTop: 0, fontSize: "0.85rem", padding: "0.6rem 2rem" }}
                  onClick={() => void connectWith(c)}
                >
                  {c.name.toUpperCase()}
                  {isActive && (
                    <span style={{ opacity: 0.55, fontWeight: 400, marginLeft: "0.6rem", fontSize: "0.7rem" }}>
                      · connected
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <p style={{ opacity: 0.5, fontSize: "0.72rem", marginTop: "1rem", maxWidth: "26rem", lineHeight: 1.7 }}>
            it needs an ethereum wallet on base sepolia. a cosmos or solana
            wallet will be asked and will not answer.
          </p>
          <button
            style={{ ...button, marginTop: "1rem", fontSize: "0.72rem", padding: "0.4rem 1.2rem",
                     letterSpacing: "0.2em", opacity: 0.7, border: "none" }}
            onClick={() => setPhase("title")}
          >
            BACK
          </button>
        </>
      )}

      {(phase === "connecting" || phase === "waking") && (
        <>
          <p style={{ opacity: 0.78, fontStyle: "italic", fontSize: "0.9rem", marginTop: "1.5rem" }}>
            {message || "…"}
          </p>
          {/* The way out has to be reachable WHILE waiting, not only after it
              has failed. If a wallet never opens its prompt there is otherwise
              nothing on screen to click, and the page reads as broken. */}
          {phase === "connecting" && (
            <button
              style={{
                ...button, marginTop: "1.2rem", fontSize: "0.74rem",
                letterSpacing: "0.12em", opacity: 0.6,
                borderColor: "rgba(200,210,190,0.18)",
              }}
              onClick={startOffline}
            >
              GO IN WITHOUT WAITING
            </button>
          )}
        </>
      )}

      {phase === "error" && (
        <>
          <p style={{ opacity: 0.82, fontSize: "0.85rem", maxWidth: "32rem", lineHeight: 1.8 }}>
            {message}
          </p>
          {/* What the browser actually offered. Without this, a wallet that
              refuses to open is indistinguishable from one that is not there,
              and the only way to tell them apart is to guess. */}
          <p style={{
            opacity: 0.5, fontSize: "0.7rem", fontFamily: "ui-monospace, monospace",
            marginTop: "0.9rem", maxWidth: "30rem", lineHeight: 1.7,
          }}>
            wallets detected:{" "}
            {connectors.length
              ? connectors.map((c) => `${c.name} (${c.id})`).join(", ")
              : "none"}
            {" · "}
            window.ethereum:{" "}
            {typeof window !== "undefined" &&
            (window as unknown as { ethereum?: unknown }).ethereum
              ? "present"
              : "absent"}
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
