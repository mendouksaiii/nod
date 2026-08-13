/**
 * Deploy NodHouse and seal it.
 *
 * Kept as a plain viem script rather than an Ignition module because sealing
 * has to happen as a second transaction with msg.value: encrypted operations
 * charge the Inco executor fee, so they cannot run in the constructor. A house
 * that is deployed but not sealed rejects every player with NotSealed.
 */
const fs = require("fs");
const path = require("path");
const { createWalletClient, createPublicClient, http } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");
const { baseSepolia } = require("viem/chains");
require("dotenv").config();

const INCO_EXECUTOR = "0xe9CB49A5b16C6D4a093E5900AA8b450FD40541B6";

(async () => {
  const artifact = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "artifacts/contracts/NodHouse.sol/NodHouse.json"),
      "utf8"
    )
  );

  const account = privateKeyToAccount(process.env.PRIVATE_KEY_BASE_SEPOLIA);
  const rpc = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
  const publicClient = createPublicClient({ chain: baseSepolia, transport: http(rpc) });
  const wallet = createWalletClient({ account, chain: baseSepolia, transport: http(rpc) });

  const before = await publicClient.getBalance({ address: account.address });
  console.log("deployer:", account.address);
  console.log("balance :", Number(before) / 1e18, "ETH");

  console.log("\ndeploying NodHouse…");
  const hash = await wallet.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode,
    args: [],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const address = receipt.contractAddress;
  console.log("deployed:", address);
  console.log("gas used:", receipt.gasUsed.toString());

  // Sealing mints the ending inside the TEE and grants it to nobody.
  const fee = await publicClient.readContract({
    address: INCO_EXECUTOR,
    abi: [
      { type: "function", name: "getFee", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
    ],
    functionName: "getFee",
  });
  console.log("\nsealing (fee", Number(fee) / 1e18, "ETH)…");
  // Give the node a moment to see the new code. Sending sealHouse in the same
  // breath as the deployment silently reverted twice — the receipt came back,
  // the script reported success, and the house was left unsealed, which
  // rejects every player with NotSealed.
  await new Promise((r) => setTimeout(r, 6000));
  const sealHash = await wallet.writeContract({
    address,
    abi: artifact.abi,
    functionName: "sealHouse",
    value: fee,
  });
  const sealReceipt = await publicClient.waitForTransactionReceipt({ hash: sealHash });
  if (sealReceipt.status !== "success") {
    throw new Error("sealHouse reverted — the house is deployed but NOT sealed");
  }

  const sealed = await publicClient.readContract({
    address,
    abi: artifact.abi,
    functionName: "sealed_",
  });
  const after = await publicClient.getBalance({ address: account.address });

  console.log("sealed  :", sealed);
  console.log("spent   :", Number(before - after) / 1e18, "ETH");
  console.log("left    :", Number(after) / 1e18, "ETH");
  console.log("\nNEXT_PUBLIC_NODHOUSE_ADDRESS=" + address);
})().catch((e) => {
  console.error("FAILED:", e.shortMessage || e.message);
  process.exit(1);
});
