"use client";

import { useState, useEffect } from "react";
import { useConfLottery } from "../hooks/useConfLottery";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { toast } from "sonner";
import confetti from "canvas-confetti";

const ConfLottery = () => {
  const [amount, setAmount] = useState("");

  const {
    address,
    currentRound,
    lotteryState,
    isAcceptingDeposits,
    isClaimable,
    isInactive,
    isOwner,
    participantCount,
    maxParticipants,
    minParticipants,
    hasDeposited,
    prizeClaimed,
    roundCancelled,
    minMet,
    winnerStatus,
    mintToken,
    approveLottery,
    deposit,
    startRound,
    drawWinner,
    endRound,
    cancelRound,
    claimPrize,
    refund,
    isEncrypting,
    isWritePending,
    isCheckingWinner,
    error,
    isLoading: lotteryLoading,
  } = useConfLottery({
    onTxSuccess: () => toast.success("transaction confirmed"),
  });

  const { openConnectModal } = useConnectModal();
  const busy = isEncrypting || isWritePending || isCheckingWinner;

  useEffect(() => {
    if (winnerStatus === true && prizeClaimed) {
      confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
    }
  }, [winnerStatus, prizeClaimed]);

  const stateLabel = isAcceptingDeposits
    ? "accepting deposits"
    : isClaimable
      ? "claimable"
      : "inactive";

  return (
    <div className="space-y-4">
      {/* Lottery Status */}
      <div className="p-5 border border-border bg-card/50">
        {lotteryLoading ? (
          <div className="text-muted-foreground animate-pulse text-sm">loading...</div>
        ) : lotteryState === null ? (
          <div className="text-muted-foreground text-sm">
            no lottery data. deploy contracts and start a round.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full ${isAcceptingDeposits ? "bg-foreground animate-pulse" : "bg-muted-foreground"}`} />
                <span className="text-muted-foreground">
                  round {currentRound?.toString() ?? "0"} — {stateLabel}
                </span>
              </div>
              <span className="text-muted-foreground">
                {participantCount?.toString() ?? "0"}/{maxParticipants?.toString() ?? "—"}
              </span>
            </div>

            {hasDeposited && (
              <div className="text-xs text-foreground/60">
                you deposited this round (encrypted)
              </div>
            )}
          </div>
        )}
      </div>

      {/* Connect */}
      {!address && openConnectModal && (
        <button
          className="w-full p-4 border border-border text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
          onClick={openConnectModal}
        >
          connect wallet →
        </button>
      )}

      {/* Owner Controls */}
      {isOwner && (
        <div className="p-5 border border-border bg-card/50">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">owner</div>
          <div className="flex gap-2">
            {isInactive && (
              <button
                className="flex-1 bg-foreground text-background text-sm font-medium px-3 py-2.5 hover:bg-foreground/90 transition-colors disabled:opacity-40"
                onClick={() => startRound(3600, 2, 10)}
                disabled={busy}
              >
                {isWritePending ? "starting..." : "start round"}
              </button>
            )}
            {isAcceptingDeposits && (
              <>
                {minMet && (
                  <button
                    className="flex-1 bg-foreground text-background text-sm font-medium px-3 py-2.5 hover:bg-foreground/90 transition-colors disabled:opacity-40"
                    onClick={() => drawWinner()}
                    disabled={busy}
                  >
                    {isWritePending ? "drawing..." : "draw winner"}
                  </button>
                )}
                <button
                  className="flex-1 border border-border text-sm font-medium px-3 py-2.5 text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-40"
                  onClick={() => cancelRound()}
                  disabled={busy}
                >
                  cancel
                </button>
              </>
            )}
            {isClaimable && prizeClaimed && (
              <button
                className="flex-1 bg-foreground text-background text-sm font-medium px-3 py-2.5 hover:bg-foreground/90 transition-colors disabled:opacity-40"
                onClick={() => endRound()}
                disabled={busy}
              >
                {isWritePending ? "ending..." : "end round"}
              </button>
            )}
            {isClaimable && !prizeClaimed && (
              <div className="text-sm text-muted-foreground py-2">
                waiting for winner to claim prize
              </div>
            )}
            {!minMet && isAcceptingDeposits && (
              <div className="text-xs text-muted-foreground py-2">
                need {minParticipants?.toString() ?? "2"} min participants
              </div>
            )}
          </div>
        </div>
      )}

      {/* User Actions — single input */}
      {address && (isAcceptingDeposits || isInactive) && !hasDeposited && (
        <div className="p-5 border border-border bg-card/50">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
            {isAcceptingDeposits ? "deposit flow" : "prepare tokens"}
          </div>
          <div className="space-y-3">
            <input
              className="w-full bg-background border border-border px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:border-foreground/50 transition-all disabled:opacity-40"
              onChange={(e) => setAmount(e.target.value)}
              placeholder="amount in cUSD"
              type="number"
              step="0.01"
              min="0"
              disabled={busy}
              value={amount}
            />
            <div className="grid grid-cols-3 gap-2">
              <button
                className="border border-border text-sm px-3 py-2.5 text-foreground hover:bg-foreground hover:text-background transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-foreground"
                onClick={() => mintToken(amount)}
                disabled={!amount || busy}
              >
                {isEncrypting ? "..." : "mint"}
              </button>
              <button
                className="border border-border text-sm px-3 py-2.5 text-foreground hover:bg-foreground hover:text-background transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-foreground"
                onClick={() => approveLottery(amount)}
                disabled={!amount || busy}
              >
                {isEncrypting ? "..." : "approve"}
              </button>
              <button
                className="bg-foreground text-background text-sm px-3 py-2.5 font-medium hover:bg-foreground/90 transition-colors disabled:opacity-40 disabled:hover:bg-foreground"
                onClick={() => { deposit(amount); setAmount(""); }}
                disabled={!amount || busy || !isAcceptingDeposits}
              >
                {isEncrypting ? "..." : isWritePending ? "..." : "deposit"}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              mint cUSD → approve lottery → deposit (same amount for each step)
            </p>
          </div>
        </div>
      )}

      {/* Claim Prize / Refund */}
      {address && isClaimable && hasDeposited && !prizeClaimed && (
        <div className="p-5 border border-border bg-card/50">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">claim</div>
          <button
            className="w-full bg-foreground text-background text-sm font-medium px-3 py-2.5 hover:bg-foreground/90 transition-colors disabled:opacity-40"
            onClick={() => claimPrize()}
            disabled={busy}
          >
            {isCheckingWinner ? "checking winner..." : isWritePending ? "claiming..." : "check & claim prize"}
          </button>
          {winnerStatus === false && (
            <p className="text-xs text-muted-foreground mt-2">not the winner this round</p>
          )}
        </div>
      )}

      {address && roundCancelled && hasDeposited && (
        <div className="p-5 border border-border bg-card/50">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">refund</div>
          <button
            className="w-full border border-border text-sm font-medium px-3 py-2.5 text-foreground hover:bg-foreground hover:text-background transition-colors disabled:opacity-40"
            onClick={() => refund()}
            disabled={busy}
          >
            {isWritePending ? "refunding..." : "claim refund"}
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="text-xs text-foreground/50 px-1">
          {error}
        </div>
      )}
    </div>
  );
};

export { ConfLottery };
