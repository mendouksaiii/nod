import { expect } from "chai";
import { HexString } from "@inco/lightning-js";
import { Address, pad, toHex } from "viem";
import nodSpikeAbi from "../artifacts/contracts/NodSpike.sol/NodSpike.json";
import { decryptValue, getFee } from "../utils/incoHelper";
import { namedWallets, wallet, publicClient, USE_ANVIL } from "../utils/wallet";

const CONFIRMATIONS = USE_ANVIL ? 1 : 5;

// Section 1 spike: prove the two properties NOD is built on.
//  1. enterHouse() mints a per-player encrypted seed only that wallet can decrypt.
//  2. The house secret decrypts for no one.
describe("NodSpike", function () {
  let spikeAddress: Address;
  let fee: bigint;

  // euint256 comes back from viem as a 0x-prefixed bytes32 string; older
  // paths returned bigint. Normalize either into a 32-byte hex handle.
  const handleOf = (raw: bigint | string): `0x${string}` =>
    typeof raw === "bigint"
      ? pad(toHex(raw), { size: 32 })
      : (raw as `0x${string}`);

  const waitForCovalidator = () =>
    new Promise((resolve) => setTimeout(resolve, 5000));

  before(async function () {
    this.timeout(300000); // live testnet: deploy + seal + confirmations
    console.log("\n=== Deploying NodSpike ===");

    const txHash = await wallet.deployContract({
      abi: nodSpikeAbi.abi,
      bytecode: nodSpikeAbi.bytecode as HexString,
      args: [],
    });
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      confirmations: CONFIRMATIONS,
    });
    spikeAddress = receipt.contractAddress as Address;
    console.log(`NodSpike deployed at: ${spikeAddress}`);

    fee = await getFee();

    // Seal the house secret (can't run in the constructor: e.rand charges
    // the Inco executor fee, which needs msg.value)
    const sealTx = await wallet.writeContract({
      address: spikeAddress,
      abi: nodSpikeAbi.abi,
      functionName: "sealHouse",
      value: fee,
    });
    await publicClient.waitForTransactionReceipt({
      hash: sealTx,
      confirmations: CONFIRMATIONS,
    });

    // Note: alice never sends a transaction — reads and attestedDecrypt are
    // offchain-signed, so she needs no ETH.
  });

  it("lets a child enter and decrypt their own seed", async function () {
    this.timeout(300000); // covalidator processing on live testnet
    const enterTx = await wallet.writeContract({
      address: spikeAddress,
      abi: nodSpikeAbi.abi,
      functionName: "enterHouse",
      value: fee,
    });
    await publicClient.waitForTransactionReceipt({
      hash: enterTx,
      confirmations: CONFIRMATIONS,
    });
    await waitForCovalidator();

    const seedHandle = (await publicClient.readContract({
      address: spikeAddress,
      abi: nodSpikeAbi.abi,
      functionName: "mySeed",
      account: wallet.account,
    })) as bigint | string;

    const seed = await decryptValue({
      walletClient: wallet,
      handle: handleOf(seedHandle),
    });
    console.log(`Deployer's run seed: ${seed}`);
    expect(seed).to.be.a("bigint");
    expect(seed > 0n).to.equal(true);
  });

  it("refuses to decrypt another child's seed", async function () {
    this.timeout(300000); // SDK backoff retries before giving up
    const alice = namedWallets.alice;

    // Alice reads the deployer's seed handle — the handle itself is public
    const deployerSeedHandle = handleOf(
      (await publicClient.readContract({
        address: spikeAddress,
        abi: nodSpikeAbi.abi,
        functionName: "seedOf",
        args: [wallet.account?.address as Address],
        account: alice.account,
      })) as bigint | string
    );

    // ...but decrypting it as Alice must fail: no e.allow for her
    let failure: string | null = null;
    try {
      await decryptValue({ walletClient: alice, handle: deployerSeedHandle });
    } catch (err: any) {
      failure = err?.message ?? String(err);
    }
    console.log(`Alice's decrypt attempt failed with: ${failure}`);
    expect(failure, "alice must NOT be able to decrypt the deployer's seed")
      .to.be.a("string");
    // Guard against passing via a client-side bug rather than access denial
    expect(failure).to.not.match(/padding|SizeExceeds/i);
  });

  it("refuses to decrypt the house secret for anyone", async function () {
    this.timeout(300000); // SDK backoff retries before giving up
    const secretHandle = handleOf(
      (await publicClient.readContract({
        address: spikeAddress,
        abi: nodSpikeAbi.abi,
        functionName: "houseSecret",
      })) as bigint | string
    );

    let failure: string | null = null;
    try {
      await decryptValue({ walletClient: wallet, handle: secretHandle });
    } catch (err: any) {
      failure = err?.message ?? String(err);
    }
    console.log(`Deployer's decrypt attempt failed with: ${failure}`);
    expect(failure, "even the deployer must NOT decrypt the house secret")
      .to.be.a("string");
    expect(failure).to.not.match(/padding|SizeExceeds/i);
  });
});
