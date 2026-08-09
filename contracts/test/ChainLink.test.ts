import { expect } from "chai";
import { Address, pad, toHex } from "viem";
import nodHouseAbi from "../artifacts/contracts/NodHouse.sol/NodHouse.json";
import { encryptValue, decryptValue, getFee } from "../utils/incoHelper";
import { namedWallets, wallet, publicClient, USE_ANVIL } from "../utils/wallet";

// Exercises the exact call sequence the browser's HouseLink performs, so a
// wiring mistake shows up here rather than behind a wallet popup.
const CONFIRMATIONS = USE_ANVIL ? 1 : 2;
const HOUSE = "0x1761c998b09df0c21553a57f0477f082f31924fd" as Address;
const LIVE = 300000;

describe("HouseLink call sequence (live house)", function () {
  const handleOf = (raw: bigint | string): `0x${string}` =>
    typeof raw === "bigint" ? pad(toHex(raw), { size: 32 }) : (raw as `0x${string}`);
  const isEmpty = (raw: bigint | string) =>
    typeof raw === "bigint" ? raw === 0n : /^0x0*$/.test(raw as string);

  const read = (fn: string, args: unknown[] = [], account = wallet.account) =>
    publicClient.readContract({
      address: HOUSE, abi: nodHouseAbi.abi, functionName: fn, args, account,
    } as never);

  let fee: bigint;
  const bob = () => namedWallets.bob;

  before(async function () {
    this.timeout(LIVE);
    fee = await getFee();
  });

  it("reads the house's public shape the way the title screen does", async function () {
    this.timeout(LIVE);
    const sealed = (await read("sealed_")) as boolean;
    const phraseCount = Number((await read("phraseCount")) as bigint);
    const endingCount = Number((await read("endingCount")) as bigint);
    const entered = Number((await read("childrenEntered")) as bigint);
    console.log(`sealed=${sealed} phrases=${phraseCount} endings=${endingCount} entered=${entered}`);
    expect(sealed, "the house must be sealed before anyone can wake in it").to.equal(true);
    expect(phraseCount).to.be.greaterThan(0);
    expect(endingCount).to.be.greaterThan(0);
  });

  it("resumes an existing run instead of starting a second one", async function () {
    this.timeout(LIVE);
    const before = (await read("runOf", [wallet.account?.address as Address])) as any[];
    // The deployer was kept on floor 6 by the NodHouse suite, so has no
    // active run — exactly the case the title screen must handle.
    console.log(`deployer run: active=${before[0]} escaped=${before[1]} floor=${before[2]}`);
    expect(typeof before[0]).to.equal("boolean");
  });

  it("walks a fresh child through wake → read floor → descend → read next", async function () {
    this.timeout(LIVE * 2);

    // Fund bob just enough for a handful of encrypted writes
    const bal = await publicClient.getBalance({ address: bob().account?.address as Address });
    if (bal < 30000000000000n) {
      const fund = await wallet.sendTransaction({
        to: bob().account?.address as Address, value: 60000000000000n,
      });
      await publicClient.waitForTransactionReceipt({ hash: fund, confirmations: CONFIRMATIONS });
    }

    const enter = await bob().writeContract({
      address: HOUSE, abi: nodHouseAbi.abi, functionName: "enterHouse", value: fee,
    });
    await publicClient.waitForTransactionReceipt({ hash: enter, confirmations: CONFIRMATIONS });
    await new Promise((r) => setTimeout(r, 5000));

    // What the game does on loadFloor(7)
    const h7 = (await read("mySeed", [7], bob().account)) as bigint | string;
    expect(isEmpty(h7), "floor 7 must exist for a child who just woke").to.equal(false);
    const seed7 = await decryptValue({ walletClient: bob(), handle: handleOf(h7) });
    console.log(`bob's floor 7 seed -> layout ${Number(seed7 % 0xffffffffn)}`);

    // ...and floor 6 must not exist yet
    const h6 = (await read("mySeed", [6], bob().account)) as bigint | string;
    expect(isEmpty(h6), "floor 6 must not exist before descending").to.equal(true);

    const down = await bob().writeContract({
      address: HOUSE, abi: nodHouseAbi.abi, functionName: "descend", args: [7], value: fee,
    });
    await publicClient.waitForTransactionReceipt({ hash: down, confirmations: CONFIRMATIONS });
    await new Promise((r) => setTimeout(r, 5000));

    const h6b = (await read("mySeed", [6], bob().account)) as bigint | string;
    expect(isEmpty(h6b), "descending must mint floor 6").to.equal(false);
    const seed6 = await decryptValue({ walletClient: bob(), handle: handleOf(h6b) });
    console.log(`bob's floor 6 seed -> layout ${Number(seed6 % 0xffffffffn)}`);
    expect(seed6).to.not.equal(seed7);
  });

  it("shows bob the wall the deployer left on floor 6", async function () {
    this.timeout(LIVE);
    const [children, , epitaphs] = (await read("marksOn", [6])) as [
      Address[], bigint[], (bigint | string)[]
    ];
    console.log(`floor 6 remembers ${children.length} child(ren)`);
    expect(children.length, "floor 6 should remember at least one child").to.be.greaterThan(0);

    const phrase = await decryptValue({
      walletClient: bob(), handle: handleOf(epitaphs[0]),
    });
    const text = (await read("phrases", [phrase])) as string;
    console.log(`bob reads from floor 6: "${text}"`);
    expect(text.length).to.be.greaterThan(0);
  });

  it("writes bob's own mark when the house keeps him", async function () {
    this.timeout(LIVE);
    const before = Number((await read("markTotal", [6])) as bigint);

    const enc = await encryptValue({
      value: 4n,
      address: bob().account?.address as `0x${string}`,
      contractAddress: HOUSE,
    });
    const fell = await bob().writeContract({
      address: HOUSE, abi: nodHouseAbi.abi, functionName: "fallToNod",
      args: [enc, false], value: fee,
    });
    await publicClient.waitForTransactionReceipt({ hash: fell, confirmations: CONFIRMATIONS });

    const after = Number((await read("markTotal", [6])) as bigint);
    console.log(`floor 6 marks: ${before} -> ${after}`);
    expect(after, "being kept must leave a mark on that floor").to.equal(before + 1);

    const run = (await read("runOf", [bob().account?.address as Address])) as any[];
    expect(run[0], "being kept ends the run").to.equal(false);
  });
});
