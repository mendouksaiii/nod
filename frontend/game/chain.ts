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
  async enterHouse() {
    await this.write("enterHouse", [], await this.fee());
  }

  /** Go down. Mints the floor below and hands over its walls. */
  async descend(from: number) {
    await this.write("descend", [from], await this.fee());
  }

  /** The house keeps you — taken, or you chose to stay. */
  async fallToNod(phraseIndex: number, settled: boolean) {
    const zap = await this.inco();
    const enc = await zap.encrypt(BigInt(phraseIndex), {
      accountAddress: this.account,
      dappAddress: HOUSE_ADDRESS,
      handleType: (await import("@inco/lightning-js")).handleTypes.euint256,
    });
    await this.write("fallToNod", [enc, settled], await this.fee());
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
    const [children, times, epitaphs] = (await this.read("marksOn", [floor])) as [
      Address[],
      bigint[],
      (bigint | string)[]
    ];
    const out: Mark[] = [];
    for (let i = 0; i < children.length; i++) {
      const phrase = await this.tryDecrypt(epitaphs[i]);
      out.push({
        child: children[i],
        at: Number(times[i]),
        phrase: phrase === null ? null : Number(phrase),
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
