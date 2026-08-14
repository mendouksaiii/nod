import { pad, toHex, type Address, type Hex, type PublicClient, type WalletClient } from "viem";
import { getIncoLightning } from "@/lib/network";
import nodHouseAbi from "@/abi/nodHouse.json";

// The bridge between the game and the house on Base.
//
// Everything here is asynchronous and slow by web standards, so it only ever
// runs at moments the game is already holding on black: waking, descending,
// being kept, and opening the last door. Nothing in this file is touched
// during play.

export const HOUSE_ADDRESS = (process.env.NEXT_PUBLIC_NODHOUSE_ADDRESS ??
  "") as Address;

export interface Mark {
  child: Address;
  at: number;
  /** Decrypted phrase index, or null if the house would not show us. */
  phrase: number | null;
  /** What they called themselves, or null if we have not got that deep. */
  name: string | null;
}

/**
 * A name packed big-endian into the low bytes of a uint256.
 *
 * 31 characters rather than 32 so the top byte is always zero and the value
 * can never be mistaken for a handle. Non-ASCII is dropped rather than
 * truncated mid-codepoint, because half a character on a memorial wall is
 * worse than a missing one.
 */
export function packName(name: string): bigint {
  const clean = name.replace(/[^ -~]/g, "").trim().slice(0, 31);
  let v = 0n;
  for (const ch of clean) v = (v << 8n) | BigInt(ch.charCodeAt(0) & 0xff);
  return v;
}

export function unpackName(packed: bigint): string {
  let v = packed;
  const chars: string[] = [];
  while (v > 0n) {
    chars.unshift(String.fromCharCode(Number(v & 0xffn)));
    v >>= 8n;
  }
  return chars.join("").trim();
}

export interface RunState {
  active: boolean;
  escaped: boolean;
  floor: number;
}

const getFeeAbi = [
  {
    type: "function" as const,
    inputs: [],
    name: "getFee",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "pure" as const,
  },
];

/** euint256 handles come back as bytes32 hex; older paths gave bigints. */
const handleOf = (raw: bigint | string): Hex =>
  typeof raw === "bigint" ? pad(toHex(raw), { size: 32 }) : (raw as Hex);

const isEmptyHandle = (raw: bigint | string) =>
  typeof raw === "bigint" ? raw === 0n : /^0x0*$/.test(raw as string);

export class HouseLink {
  private zap: any = null;

  constructor(
    private publicClient: PublicClient,
    private walletClient: WalletClient,
    public readonly account: Address
  ) {}

  private async inco() {
    if (!this.zap) this.zap = await getIncoLightning();
    return this.zap;
  }

  private async fee(): Promise<bigint> {
    const zap = await this.inco();
    return (await this.publicClient.readContract({
      address: zap.executorAddress,
      abi: getFeeAbi,
      functionName: "getFee",
    })) as bigint;
  }

  private async write(functionName: string, args: unknown[] = [], value?: bigint) {
    const hash = await this.walletClient.writeContract({
      address: HOUSE_ADDRESS,
      abi: nodHouseAbi,
      functionName,
      args,
      value,
      chain: this.walletClient.chain,
      account: this.account,
    } as never);
    await this.publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
    return hash;
  }

  private read(functionName: string, args: unknown[] = []) {
    return this.publicClient.readContract({
      address: HOUSE_ADDRESS,
      abi: nodHouseAbi,
      functionName,
      args,
      account: this.account,
    } as never);
  }

  /** Decrypt a handle we may or may not be allowed to see. */
  private async tryDecrypt(raw: bigint | string): Promise<bigint | null> {
    if (isEmptyHandle(raw)) return null;
    try {
      const zap = await this.inco();
      const res = await zap.attestedDecrypt(this.walletClient, [handleOf(raw)], {
        backoffConfig: { maxRetries: 10, baseDelayInMs: 1500, backoffFactor: 1.35 },
      });
      const v = res[0].plaintext.value;
      return typeof v === "boolean" ? (v ? 1n : 0n) : (v as bigint);
    } catch {
      // Not ours to read. On this floor that is the whole point.
      return null;
    }
  }

  // ── The four moments ────────────────────────────────────────────────

  /** "The house learns your name." */
  /**
   * Walk in, and tell the house what to call you.
   *
   * The name goes in ENCRYPTED, under the same access rule as your last words:
   * granted to you, and afterwards to anyone who reaches the floor where you
   * stopped. An address is public forever and says nothing about a child. A
   * name is the part that makes a mark on the wall land — so the name is the
   * secret, and the only way to learn one is to get as deep as they did.
   *
   * Packed big-endian into the low bytes of a uint256, so up to 31 characters
   * survive the round trip. Empty is allowed; the house just never learns it.
   */
  async enterHouse() {
    // Deliberately lean: no encrypted value here, only the seed the contract
    // mints internally. enterHouse used to encrypt the name too, and that
    // second encrypted operation pushed the transaction over Base Sepolia's
    // per-transaction gas limit — it reverted every time. The name is
    // encrypted at fallToNod instead, where it is the only encrypted value in
    // the call.
    await this.write("enterHouse", [], await this.fee());
  }

  /** Go down. Mints the floor below and hands over its walls. */
  async descend(from: number) {
    await this.write("descend", [from], await this.fee());
  }

  /**
   * The house keeps you — taken, or you chose to stay.
   *
   * This is where your NAME is written to the wall, encrypted, and it is the
   * one encrypted value the transaction creates. The warning you leave is a
   * plain index into a fixed list — public, because it is one of a handful of
   * fixed phrases, and because a second encrypted value here would overrun the
   * gas limit exactly as it did in enterHouse.
   */
  async fallToNod(name: string, warningIndex: number, settled: boolean) {
    const zap = await this.inco();
    const enc = await zap.encrypt(packName(name), {
      accountAddress: this.account,
      dappAddress: HOUSE_ADDRESS,
      handleType: (await import("@inco/lightning-js")).handleTypes.euint256,
    });
    await this.write("fallToNod", [enc, warningIndex, settled], await this.fee());
  }

  /** Open the last door. Returns the ending text the house was holding. */
  async reachTheDoor(): Promise<string> {
    await this.write("reachTheDoor");
    const handle = (await this.read("ending")) as bigint | string;
    const value = await this.tryDecrypt(handle);
    if (value === null) return "the door opens onto nothing you can remember.";
    const count = (await this.read("endingCount")) as bigint;
    const which = value % count;
    return (await this.read("endings", [which])) as string;
  }

  // ── Reading the house ───────────────────────────────────────────────

  /**
   * The encrypted layout seed for a floor. Returns null when the house has
   * not minted it — which is what "you have not earned this floor" looks
   * like from here.
   */
  async floorSeed(floor: number): Promise<bigint | null> {
    const handle = (await this.read("mySeed", [floor])) as bigint | string;
    return this.tryDecrypt(handle);
  }

  /** Who the house kept on this floor, and what they left — if we may read it. */
  async marksOn(floor: number): Promise<Mark[]> {
    const [children, times, warnings, names] = (await this.read("marksOn", [floor])) as [
      Address[],
      bigint[],
      number[],
      (bigint | string)[]
    ];
    const out: Mark[] = [];
    for (let i = 0; i < children.length; i++) {
      // The warning is a plain index now — no decrypt. The NAME is the secret,
      // and null here is the normal case, not an error: it means the house has
      // not granted us this child's name because we have not got that far.
      const packed = await this.tryDecrypt(names[i]);
      out.push({
        child: children[i],
        at: Number(times[i]),
        phrase: Number(warnings[i]),
        name: packed === null ? null : unpackName(packed),
      });
    }
    return out;
  }

  async phrases(): Promise<string[]> {
    const n = Number((await this.read("phraseCount")) as bigint);
    const out: string[] = [];
    for (let i = 0; i < n; i++) out.push((await this.read("phrases", [i])) as string);
    return out;
  }

  async runState(): Promise<RunState> {
    const r = (await this.read("runOf", [this.account])) as [
      boolean, boolean, number, bigint, bigint
    ];
    return { active: r[0], escaped: r[1], floor: Number(r[2]) };
  }

  async isSealed(): Promise<boolean> {
    return (await this.read("sealed_")) as boolean;
  }
}
