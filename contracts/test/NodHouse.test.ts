import { expect } from "chai";
import { HexString } from "@inco/lightning-js";
import { Address, formatEther, parseEther, pad, toHex } from "viem";
import nodHouseAbi from "../artifacts/contracts/NodHouse.sol/NodHouse.json";
import { encryptValue, decryptValue, getFee } from "../utils/incoHelper";
import { namedWallets, wallet, publicClient, USE_ANVIL } from "../utils/wallet";

const CONFIRMATIONS = USE_ANVIL ? 1 : 2;
const LIVE = 300000;

// The three claims NOD is built on, tested as claims rather than as calls:
//   1. You cannot read a floor you have not earned.
//   2. You cannot read what another child left unless you are standing there.
//   3. Nobody can read the ending without having reached the door.
describe("NodHouse", function () {
  let house: Address;
  let fee: bigint;

  const handleOf = (raw: bigint | string): `0x${string}` =>
    typeof raw === "bigint" ? pad(toHex(raw), { size: 32 }) : (raw as `0x${string}`);

  const wait = (hash: `0x${string}`) =>
    publicClient.waitForTransactionReceipt({ hash, confirmations: CONFIRMATIONS });

  const settle = () => new Promise((r) => setTimeout(r, 5000));

  /** Read a handle back and try to decrypt it as `who`. */
  async function tryDecrypt(who: any, handle: `0x${string}`) {
    try {
      const v = await decryptValue({ walletClient: who, handle });
      return { ok: true as const, value: v };
    } catch (err: any) {
      return { ok: false as const, error: err?.message ?? String(err) };
    }
  }

  const alice = () => namedWallets.alice;

  before(async function () {
    this.timeout(LIVE);
    console.log("\n=== Deploying NodHouse ===");

    const tx = await wallet.deployContract({
      abi: nodHouseAbi.abi,
      bytecode: nodHouseAbi.bytecode as HexString,
      args: [],
    });
    const receipt = await wait(tx);
    house = receipt.contractAddress as Address;
    console.log(`NodHouse deployed at: ${house}`);

    fee = await getFee();

    // Fund alice for ~9 transactions. The Inco fee is 1e-6 ETH per encrypted
    // op and Base Sepolia gas is ~0.006 gwei, so this is generous.
    const bal = await publicClient.getBalance({
      address: alice().account?.address as Address,
    });
    if (Number(formatEther(bal)) < 0.00004) {
      const fund = await wallet.sendTransaction({
        to: alice().account?.address as Address,
        value: parseEther("0.00009"),
      });
      await wait(fund);
    }

    // Seal the bottom. The ending is drawn in the TEE — the owner never
    // learns it, which is the point of the whole mechanism.
    const sealTx = await wallet.writeContract({
      address: house,
      abi: nodHouseAbi.abi,
      functionName: "sealHouse",
      value: fee,
    });
    await wait(sealTx);
    console.log("House sealed.");
  });

  it("lets a child in and gives them only the seventh floor", async function () {
    this.timeout(LIVE);

    const enter = await wallet.writeContract({
      address: house,
      abi: nodHouseAbi.abi,
      functionName: "enterHouse",
      value: fee,
    });
    await wait(enter);
    await settle();

    const seed7 = handleOf(
      (await publicClient.readContract({
        address: house, abi: nodHouseAbi.abi, functionName: "mySeed",
        args: [7], account: wallet.account,
      })) as bigint | string
    );
    const got = await tryDecrypt(wallet, seed7);
    console.log(`floor 7 seed: ${got.ok ? got.value : got.error}`);
    expect(got.ok, "must be able to read the floor you woke on").to.equal(true);

    // Floor 6 has not been minted — there is nothing there to read
    const seed6 = (await publicClient.readContract({
      address: house, abi: nodHouseAbi.abi, functionName: "mySeed",
      args: [6], account: wallet.account,
    })) as bigint | string;
    const empty =
      typeof seed6 === "bigint"
        ? seed6 === 0n
        : /^0x0+$/.test(seed6 as string);
    expect(empty, "the floor below must not exist yet").to.equal(true);
  });

  it("refuses to let anyone else read your run", async function () {
    this.timeout(LIVE);

    const seed7 = handleOf(
      (await publicClient.readContract({
        address: house, abi: nodHouseAbi.abi, functionName: "seedOf",
        args: [wallet.account?.address as Address, 7],
      })) as bigint | string
    );
    // The handle is public. The value is not.
    const stolen = await tryDecrypt(alice(), seed7);
    console.log(`alice reading someone else's floor: ${stolen.ok ? "READ IT" : stolen.error}`);
    expect(stolen.ok, "another wallet must not decrypt your seed").to.equal(false);
  });

  it("mints the next floor only once you have left the one above", async function () {
    this.timeout(LIVE);

    const down = await wallet.writeContract({
      address: house, abi: nodHouseAbi.abi, functionName: "descend",
      args: [7], value: fee,
    });
    await wait(down);
    await settle();

    const seed6 = handleOf(
      (await publicClient.readContract({
        address: house, abi: nodHouseAbi.abi, functionName: "mySeed",
        args: [6], account: wallet.account,
      })) as bigint | string
    );
    const got = await tryDecrypt(wallet, seed6);
    console.log(`floor 6 seed after descending: ${got.ok ? got.value : got.error}`);
    expect(got.ok, "descending must unlock the next floor").to.equal(true);

    const run = (await publicClient.readContract({
      address: house, abi: nodHouseAbi.abi, functionName: "runOf",
      args: [wallet.account?.address as Address],
    })) as any[];
    expect(Number(run[2]), "should now be standing on floor 6").to.equal(6);
  });

  it("cannot skip a floor", async function () {
    this.timeout(LIVE);
    let reverted = false;
    try {
      // He is on 6; claiming to leave 5 must fail
      await publicClient.simulateContract({
        address: house, abi: nodHouseAbi.abi, functionName: "descend",
        args: [5], value: fee, account: wallet.account!,
      });
    } catch {
      reverted = true;
    }
    expect(reverted, "descend must require you to be where you say you are").to.equal(true);
  });

  it("keeps a child, and hides their epitaph from anyone not standing there", async function () {
    this.timeout(LIVE);

    // The deployer is taken on floor 6 and leaves a warning
    const encPhrase = await encryptValue({
      value: 4n, // "she hears you cry" — floor 6's warning
      address: wallet.account?.address as `0x${string}`,
      contractAddress: house,
    });
    const fell = await wallet.writeContract({
      address: house, abi: nodHouseAbi.abi, functionName: "fallToNod",
      args: [encPhrase, false], value: fee,
    });
    await wait(fell);
    await settle();

    const marks = (await publicClient.readContract({
      address: house, abi: nodHouseAbi.abi, functionName: "marksOn", args: [6],
    })) as [Address[], bigint[], (bigint | string)[]];
    expect(marks[0].length, "floor 6 should remember one child").to.be.greaterThan(0);

    const epitaph = handleOf(marks[2][0]);

    // Alice has never been to floor 6. The wall is illegible to her.
    const peek = await tryDecrypt(alice(), epitaph);
    console.log(`alice reading floor 6's wall from outside: ${peek.ok ? "READ IT" : peek.error}`);
    expect(peek.ok, "you must not read a floor you have not reached").to.equal(false);

    // The child who wrote it can always read their own last words
    const own = await tryDecrypt(wallet, epitaph);
    expect(own.ok, "you can read what you left").to.equal(true);
    expect(Number(own.ok ? own.value : -1)).to.equal(4);
  });

  it("hands the wall over once you are standing on that floor", async function () {
    this.timeout(LIVE);

    // Alice wakes in the house and walks down to floor 6
    const aEnter = await alice().writeContract({
      address: house, abi: nodHouseAbi.abi, functionName: "enterHouse", value: fee,
    });
    await wait(aEnter);
    const aDown = await alice().writeContract({
      address: house, abi: nodHouseAbi.abi, functionName: "descend",
      args: [7], value: fee,
    });
    await wait(aDown);
    await settle();

    const marks = (await publicClient.readContract({
      address: house, abi: nodHouseAbi.abi, functionName: "marksOn", args: [6],
    })) as [Address[], bigint[], (bigint | string)[]];
    const epitaph = handleOf(marks[2][0]);

    const now = await tryDecrypt(alice(), epitaph);
    console.log(`alice reading the same wall from floor 6: ${now.ok ? now.value : now.error}`);
    expect(now.ok, "arriving on the floor must make its walls readable").to.equal(true);
    expect(Number(now.ok ? now.value : -1)).to.equal(4);
  });

  it("keeps the ending sealed from everyone, including its owner", async function () {
    this.timeout(LIVE);

    const handle = handleOf(
      (await publicClient.readContract({
        address: house, abi: nodHouseAbi.abi, functionName: "ending",
      })) as bigint | string
    );

    const byOwner = await tryDecrypt(wallet, handle);
    console.log(`owner reading the ending: ${byOwner.ok ? "READ IT" : byOwner.error}`);
    expect(byOwner.ok, "even the deployer must not know the ending").to.equal(false);

    const byAlice = await tryDecrypt(alice(), handle);
    expect(byAlice.ok, "a player mid-run must not know the ending").to.equal(false);
  });

  it("opens the ending only for a child who reached the door", async function () {
    this.timeout(LIVE * 2);

    // Alice is on 6. Walk her down to the ground floor.
    for (let from = 6; from > 1; from--) {
      const tx = await alice().writeContract({
        address: house, abi: nodHouseAbi.abi, functionName: "descend",
        args: [from], value: fee,
      });
      await wait(tx);
    }
    const open = await alice().writeContract({
      address: house, abi: nodHouseAbi.abi, functionName: "reachTheDoor",
    });
    await wait(open);
    await settle();

    const handle = handleOf(
      (await publicClient.readContract({
        address: house, abi: nodHouseAbi.abi, functionName: "ending",
      })) as bigint | string
    );
    const got = await tryDecrypt(alice(), handle);
    expect(got.ok, "reaching the door must unseal the ending").to.equal(true);

    // The number selects which of the public endings this house was holding
    const count = (await publicClient.readContract({
      address: house, abi: nodHouseAbi.abi, functionName: "endingCount",
    })) as bigint;
    const which = (got.value as bigint) % count;
    const text = (await publicClient.readContract({
      address: house, abi: nodHouseAbi.abi, functionName: "endings", args: [which],
    })) as string;
    console.log(`alice opened the door and found ending ${which}: "${text}"`);
    expect(text.length, "the ending must resolve to real text").to.be.greaterThan(0);

    // ...and it is still sealed for everyone else
    const stillSealed = await tryDecrypt(wallet, handle);
    expect(stillSealed.ok, "the ending stays sealed for those who did not get there")
      .to.equal(false);
  });
});
