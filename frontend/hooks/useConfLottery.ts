"use client";

import { useAccount, usePublicClient, useWalletClient, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useCallback, useEffect, useState } from "react";
import { parseEther, bytesToHex, pad, toHex, type Address, type Hex } from "viem";
import { getIncoLightning } from "@/lib/network";
import { handleTypes } from "@inco/lightning-js";
import confLotteryAbi from "@/abi/confLottery.json";
import confTokenAbi from "@/abi/confToken.json";

const LOTTERY_ADDRESS = process.env.NEXT_PUBLIC_CONFLOTTERY_ADDRESS as `0x${string}`;

const getFeeAbi = [
  {
    type: "function" as const,
    inputs: [],
    name: "getFee",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "pure" as const,
  },
];

let zapInstance: any = null;

async function getZap() {
  if (zapInstance) return zapInstance;
  // Network (Base Sepolia / Mainnet) is selected centrally in lib/network.ts via NEXT_PUBLIC_NETWORK.
  zapInstance = await getIncoLightning();
  return zapInstance;
}

interface UseConfLotteryProps {
  onTxSuccess?: () => void;
}

export function useConfLottery({ onTxSuccess }: UseConfLotteryProps = {}) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const [error, setError] = useState<string | null>(null);
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [winnerStatus, setWinnerStatus] = useState<boolean | null>(null);
  const [isCheckingWinner, setIsCheckingWinner] = useState(false);

  async function getIncoFee() {
    const zap = await getZap();
    return (await publicClient!.readContract({
      address: zap.executorAddress,
      abi: getFeeAbi,
      functionName: "getFee",
    })) as bigint;
  }

  // ── Lottery reads ──

  const { data: ownerAddress } = useReadContract({
    address: LOTTERY_ADDRESS, abi: confLotteryAbi, functionName: "owner",
    query: { enabled: !!LOTTERY_ADDRESS },
  });

  const { data: tokenAddress } = useReadContract({
    address: LOTTERY_ADDRESS, abi: confLotteryAbi, functionName: "token",
    query: { enabled: !!LOTTERY_ADDRESS },
  });

  const { data: minParticipantsData } = useReadContract({
    address: LOTTERY_ADDRESS, abi: confLotteryAbi, functionName: "minParticipants",
    query: { enabled: !!LOTTERY_ADDRESS },
  });

  const { data: currentRound, isLoading: roundLoading } = useReadContract({
    address: LOTTERY_ADDRESS, abi: confLotteryAbi, functionName: "currentRound",
    query: { enabled: !!LOTTERY_ADDRESS },
  });

  const { data: lotteryState, isLoading: stateLoading, refetch: refetchState } = useReadContract({
    address: LOTTERY_ADDRESS, abi: confLotteryAbi, functionName: "state",
    query: { enabled: !!LOTTERY_ADDRESS },
  });

  const { data: participantCount, refetch: refetchParticipants } = useReadContract({
    address: LOTTERY_ADDRESS, abi: confLotteryAbi, functionName: "getParticipantCount",
    query: { enabled: !!LOTTERY_ADDRESS },
  });

  const { data: maxParticipantsData } = useReadContract({
    address: LOTTERY_ADDRESS, abi: confLotteryAbi, functionName: "maxParticipants",
    query: { enabled: !!LOTTERY_ADDRESS },
  });

  const { data: hasDepositedData, refetch: refetchDeposit } = useReadContract({
    address: LOTTERY_ADDRESS, abi: confLotteryAbi, functionName: "hasDeposited",
    args: [currentRound as bigint, address as Address],
    query: { enabled: !!LOTTERY_ADDRESS && !!address && currentRound !== undefined },
  });

  const { data: prizeClaimedData, refetch: refetchPrizeClaimed } = useReadContract({
    address: LOTTERY_ADDRESS, abi: confLotteryAbi, functionName: "prizeClaimed",
    args: [currentRound as bigint],
    query: { enabled: !!LOTTERY_ADDRESS && currentRound !== undefined },
  });

  const { data: roundCancelledData } = useReadContract({
    address: LOTTERY_ADDRESS, abi: confLotteryAbi, functionName: "roundCancelled",
    args: [currentRound as bigint],
    query: { enabled: !!LOTTERY_ADDRESS && currentRound !== undefined },
  });

  // ── Write ──

  const { writeContract, data: txHash, isPending: isWritePending, error: writeError } = useWriteContract();

  const { isSuccess: txConfirmed } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (txConfirmed) {
      refetchState();
      refetchParticipants();
      refetchDeposit();
      refetchPrizeClaimed();
      onTxSuccess?.();
    }
  }, [txConfirmed]);

  // ── Derived ──

  const stateNum = lotteryState !== undefined ? Number(lotteryState) : null;
  const isAcceptingDeposits = stateNum === 1;
  const isClaimable = stateNum === 2;
  const isInactive = stateNum === 0;
  const hasDeposited = hasDepositedData === true;
  const prizeClaimed = prizeClaimedData === true;
  const roundCancelled = roundCancelledData === true;
  const isOwner = !!address && !!ownerAddress && address.toLowerCase() === (ownerAddress as string).toLowerCase();
  const tokenAddr = tokenAddress as `0x${string}` | undefined;
  const minMet = participantCount !== undefined && minParticipantsData !== undefined
    && (participantCount as bigint) >= (minParticipantsData as bigint);

  // ── Token: mint ──

  const mintToken = useCallback(async (amount: string) => {
    if (!address || !tokenAddr || !publicClient) return;
    setError(null);
    setIsEncrypting(true);
    try {
      const zap = await getZap();
      const enc = await zap.encrypt(parseEther(amount), {
        accountAddress: address, dappAddress: tokenAddr, handleType: handleTypes.euint256,
      });
      setIsEncrypting(false);
      const fee = await getIncoFee();
      writeContract({ address: tokenAddr, abi: confTokenAbi, functionName: "encryptedMint", args: [enc], value: fee });
    } catch (err: any) {
      setIsEncrypting(false);
      setError(err.message || "Mint failed");
    }
  }, [address, tokenAddr, publicClient, writeContract]);

  // ── Token: approve lottery ──

  const approveLottery = useCallback(async (amount: string) => {
    if (!address || !tokenAddr || !LOTTERY_ADDRESS || !publicClient) return;
    setError(null);
    setIsEncrypting(true);
    try {
      const zap = await getZap();
      const enc = await zap.encrypt(parseEther(amount), {
        accountAddress: address, dappAddress: tokenAddr, handleType: handleTypes.euint256,
      });
      setIsEncrypting(false);
      const fee = await getIncoFee();
      writeContract({ address: tokenAddr, abi: confTokenAbi, functionName: "approve", args: [LOTTERY_ADDRESS, enc], value: fee });
    } catch (err: any) {
      setIsEncrypting(false);
      setError(err.message || "Approve failed");
    }
  }, [address, tokenAddr, publicClient, writeContract]);

  // ── Lottery: deposit ──

  const deposit = useCallback(async (amount: string) => {
    if (!address || !LOTTERY_ADDRESS || !publicClient) return;
    setError(null);
    setIsEncrypting(true);
    try {
      const zap = await getZap();
      const enc = await zap.encrypt(parseEther(amount), {
        accountAddress: address, dappAddress: LOTTERY_ADDRESS, handleType: handleTypes.euint256,
      });
      setIsEncrypting(false);
      const fee = await getIncoFee();
      writeContract({ address: LOTTERY_ADDRESS, abi: confLotteryAbi, functionName: "deposit", args: [enc], value: fee });
    } catch (err: any) {
      setIsEncrypting(false);
      setError(err.message || "Deposit failed");
    }
  }, [address, publicClient, writeContract]);

  // ── Lottery: start round (owner) ──

  const startRound = useCallback((duration: number, minP: number, maxP: number) => {
    if (!address || !LOTTERY_ADDRESS) return;
    writeContract({
      address: LOTTERY_ADDRESS, abi: confLotteryAbi, functionName: "startRound",
      args: [BigInt(duration), BigInt(minP), BigInt(maxP)],
    });
  }, [address, writeContract]);

  // ── Lottery: draw winner (owner) ──

  const drawWinner = useCallback(async () => {
    if (!address || !LOTTERY_ADDRESS || !publicClient) return;
    try {
      const fee = await getIncoFee();
      writeContract({ address: LOTTERY_ADDRESS, abi: confLotteryAbi, functionName: "drawWinner", value: fee });
    } catch (err: any) {
      setError(err.message || "drawWinner failed");
    }
  }, [address, publicClient, writeContract]);

  // ── Lottery: end round (owner) ──

  const endRound = useCallback(() => {
    if (!address || !LOTTERY_ADDRESS) return;
    writeContract({ address: LOTTERY_ADDRESS, abi: confLotteryAbi, functionName: "endRound" });
  }, [address, writeContract]);

  // ── Lottery: cancel round (owner) ──

  const cancelRound = useCallback(() => {
    if (!address || !LOTTERY_ADDRESS) return;
    writeContract({ address: LOTTERY_ADDRESS, abi: confLotteryAbi, functionName: "cancelRound" });
  }, [address, writeContract]);

  // ── Lottery: check winner + claim prize ──

  const claimPrize = useCallback(async () => {
    if (!address || !LOTTERY_ADDRESS || !walletClient || !publicClient || currentRound === undefined) return;
    setError(null);
    setIsCheckingWinner(true);
    try {
      const zap = await getZap();

      // Get encrypted winner check handle (returns uint256 as bigint)
      const handleRaw = (await publicClient.readContract({
        address: LOTTERY_ADDRESS, abi: confLotteryAbi, functionName: "getMyWinnerCheck",
        args: [currentRound as bigint],
        account: address,
      })) as bigint;

      // Convert bigint handle to 0x-prefixed hex string (32 bytes)
      const winnerHandle = pad(toHex(handleRaw), { size: 32 });

      // Get attestation (decrypts + provides proof)
      const attestedResult = await zap.attestedDecrypt(walletClient, [winnerHandle]);
      const result = attestedResult[0];
      const rawValue = result.plaintext.value;
      // attestedDecrypt for ebool returns boolean (true/false), not BigInt
      const isWinner = typeof rawValue === 'boolean' ? rawValue : rawValue === BigInt(1);
      setWinnerStatus(isWinner);
      setIsCheckingWinner(false);

      if (!isWinner) {
        setError("You are not the winner this round");
        return;
      }

      // Build claim args - encode boolean as uint256 for the contract
      const signatures = result.covalidatorSignatures.map((sig: Uint8Array) => bytesToHex(sig));
      const encodedValue = pad(toHex(typeof rawValue === 'boolean' ? (rawValue ? 1 : 0) : Number(rawValue)), { size: 32 });

      writeContract({
        address: LOTTERY_ADDRESS, abi: confLotteryAbi, functionName: "claimPrize",
        args: [{ handle: result.handle as Hex, value: encodedValue }, signatures],
      });
    } catch (err: any) {
      setIsCheckingWinner(false);
      setError(err.message || "Claim failed");
    }
  }, [address, walletClient, publicClient, currentRound, writeContract]);

  // ── Lottery: refund (after cancel) ──

  const refund = useCallback(() => {
    if (!address || !LOTTERY_ADDRESS || currentRound === undefined) return;
    writeContract({
      address: LOTTERY_ADDRESS, abi: confLotteryAbi, functionName: "refund",
      args: [currentRound as bigint],
    });
  }, [address, currentRound, writeContract]);

  return {
    address,
    tokenAddress: tokenAddr,
    currentRound: currentRound as bigint | undefined,
    lotteryState: stateNum,
    isAcceptingDeposits,
    isClaimable,
    isInactive,
    isOwner,
    participantCount: participantCount as bigint | undefined,
    maxParticipants: maxParticipantsData as bigint | undefined,
    minParticipants: minParticipantsData as bigint | undefined,
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
    txHash,
    txConfirmed,
    error: error || writeError?.message || null,
    isLoading: roundLoading || stateLoading,
  };
}
