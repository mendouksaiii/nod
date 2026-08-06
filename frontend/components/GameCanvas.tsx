"use client";

import { useEffect, useRef } from "react";

export default function GameCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let game: { dispose: () => void } | null = null;
    let cancelled = false;

    (async () => {
      const { NodGame } = await import("@/game/game");
      if (cancelled || !hostRef.current) return;
      game = new NodGame(hostRef.current);
    })();

    return () => {
      cancelled = true;
      game?.dispose();
    };
  }, []);

  return (
    <div
      ref={hostRef}
      style={{
        position: "fixed",
        inset: 0,
        background: "#07090d",
        overflow: "hidden",
      }}
    />
  );
}
