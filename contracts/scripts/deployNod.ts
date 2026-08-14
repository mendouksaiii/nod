// Deploy + seal a fresh NodHouse, and print the address for the frontend env.
//
// enterHouse must stay lean — one encrypted value per transaction — or it
// exceeds Base Sepolia's per-transaction gas limit. This deploys the version
// that keeps to that rule (seed only in enterHouse; the name is encrypted at
// fallToNod instead).
import nodHouseAbi from "../artifacts/contracts/NodHouse.sol/NodHouse.json";
import { getFee } from "../utils/incoHelper";
import { wallet, publicClient } from "../utils/wallet";
import { HexString } from "@inco/lightning-js";
import { formatEther } from "viem";

async function main() {
  const bal = await publicClient.getBalance({ address: wallet.account!.address });
  console.log("deployer:", wallet.account!.address, formatEther(bal), "ETH");

  console.log("deploying NodHouse…");
  const tx = await wallet.deployContract({
    abi: nodHouseAbi.abi,
    bytecode: nodHouseAbi.bytecode as HexString,
    args: [],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: tx, confirmations: 2 });
  const house = receipt.contractAddress!;
  console.log("deployed at:", house);

  const fee = await getFee();
  console.log("inco fee:", formatEther(fee), "ETH — sealing…");
  const sealTx = await wallet.writeContract({
    address: house,
    abi: nodHouseAbi.abi,
    functionName: "sealHouse",
    value: fee,
  });
  await publicClient.waitForTransactionReceipt({ hash: sealTx, confirmations: 2 });

  const sealed = await publicClient.readContract({
    address: house,
    abi: nodHouseAbi.abi,
    functionName: "sealed_",
  });
  console.log("sealed:", sealed);
  console.log("\n=== SET THIS IN frontend/.env.local AND VERCEL ===");
  console.log(`NEXT_PUBLIC_NODHOUSE_ADDRESS=${house}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
