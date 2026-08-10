"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount, useChainId, useConnect, usePublicClient, useSwitchChain, useWalletClient } from "wagmi";
import { activeChain } from "@/lib/network";
import { HouseLink, HOUSE_ADDRESS } from "@/game/chain";

type Phase = "title" | "connecting" | "waking" | "playing" | "error";

const shell: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "1.1rem",
  background: "#07090d",
  color: "#9aa2b5",
  fontFamily: "Georgia, serif",
  textAlign: "center",
  padding: "2rem",
};

const button: React.CSSProperties = {
  marginTop: "1.6rem",
  padding: "0.7rem 2.2rem",
  background: "transparent",
  color: "#c8d2be",
  border: "1px solid rgba(200,210,190,0.35)",
  fontFamily: "Georgia, serif",
  fontSize: "0.95rem",
  letterSpacing: "0.18em",
  cursor: "pointer",
};

export default function Title() {
  const [phase, setPhase] = useState<Phase>("title");
  const [message, setMessage] = useState("");
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<{ dispose: () => void } | null>(null);
  /** Set when a run is ready to start; `link: null` means play without the chain. */
  const [startWith, setStartWith] = useState<{ link: HouseLink | null } | null>(null);

  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  // Tear the game down if this component ever unmounts
  useEffect(() => () => gameRef.current?.dispose(), []);

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
      gameRef.current = new NodGame(hostRef.current, startWith.link);
    })();
    return () => { cancelled = true; };
  }, [phase, startWith]);

  async function wake() {
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

  // Once the wallet is connected, carry on into the house
  useEffect(() => {
    if (phase === "connecting" && isConnected && walletClient && publicClient) {
      void beginRun();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, isConnected, walletClient, publicClient]);

  /**
   * Play with no chain at all. The house still works — it just does not
   * remember you, and the floors below are not sealed against you. This has
   * to exist: without it, anyone with no wallet, no testnet ether or the
   * wrong network simply cannot play the game.
   */
  function startOffline() {
    setStartWith({ link: null });
    setPhase("playing");
  }

  async function beginRun() {
    if (!walletClient || !publicClient || !address) return;
    setPhase("waking");
    try {
      if (chainId !== activeChain.id) {
        setMessage("this house is on base sepolia…");
        await switchChainAsync({ chainId: activeChain.id });
      }

      const link = new HouseLink(publicClient as never, walletClient, address);

      if (!HOUSE_ADDRESS) throw new Error("the house has no address configured");
      if (!(await link.isSealed())) throw new Error("this house has not been sealed yet");

      // A run that is already underway is resumed rather than restarted.
      const run = await link.runState();
      if (!run.active) {
        setMessage("the house learns your name…");
        await link.enterHouse();
      } else {
        setMessage(`you were on the ${run.floor}th floor…`);
      }

      setStartWith({ link });
      setPhase("playing");
    } catch (err: unknown) {
      setPhase("error");
      const raw = err instanceof Error ? err.message : String(err);
      setMessage(raw.length > 160 ? raw.slice(0, 160) + "…" : raw);
    }
  }

  if (phase === "playing") {
    return (
      <div
        ref={hostRef}
        style={{ position: "fixed", inset: 0, background: "#07090d", overflow: "hidden" }}
      />
    );
  }

  return (
    <main style={shell}>
      <h1 style={{ fontWeight: 400, letterSpacing: "0.55em", fontSize: "2.2rem", margin: 0 }}>
        N O D
      </h1>
      <p style={{ opacity: 0.55, fontStyle: "italic", fontSize: "0.95rem", margin: 0 }}>
        the stairs only go down
      </p>

      {phase === "title" && (
        <>
          <p style={{ opacity: 0.4, fontSize: "0.82rem", maxWidth: "34rem", lineHeight: 1.9 }}>
            you are eight years old and this is not your house.
            <br />
            other children woke here before you. some of them are still here.
          </p>
          <button style={button} onClick={() => void wake()}>
            WAKE UP
          </button>
          <p style={{ opacity: 0.25, fontSize: "0.7rem", marginTop: "0.6rem" }}>
            the house needs a wallet to learn your name — base sepolia
          </p>
          <button
            style={{
              ...button, marginTop: "0.8rem", fontSize: "0.78rem",
              letterSpacing: "0.12em", opacity: 0.5, borderColor: "rgba(200,210,190,0.18)",
            }}
            onClick={startOffline}
          >
            WAKE UP WITHOUT BEING REMEMBERED
          </button>
        </>
      )}

      {(phase === "connecting" || phase === "waking") && (
        <p style={{ opacity: 0.5, fontStyle: "italic", fontSize: "0.9rem", marginTop: "1.5rem" }}>
          {message || "…"}
        </p>
      )}

      {phase === "error" && (
        <>
          <p style={{ opacity: 0.6, fontSize: "0.85rem", maxWidth: "32rem", lineHeight: 1.8 }}>
            {message}
          </p>
          <button style={button} onClick={() => void wake()}>
            TRY AGAIN
          </button>
          {/* A failed handshake must never be a dead end */}
          <button
            style={{
              ...button, marginTop: "0.8rem", fontSize: "0.78rem",
              letterSpacing: "0.12em", opacity: 0.5, borderColor: "rgba(200,210,190,0.18)",
            }}
            onClick={startOffline}
          >
            GO IN ANYWAY
          </button>
        </>
      )}
    </main>
  );
}
