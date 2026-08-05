import { expect } from "chai";
import { HexString } from "@inco/lightning-js";
import {
  Address,
  parseEther,
  formatEther,
  getAddress,
} from "viem";
import confidentialERC20Abi from "../artifacts/contracts/ConfidentialERC20.sol/ConfidentialERC20.json";
import confidentialLotteryAbi from "../artifacts/contracts/ConfidentialLottery.sol/ConfidentialLottery.json";
import {
  encryptValue,
  decryptValue,
  getDecryptionAttestation,
  getFee,
} from "../utils/incoHelper";
import { namedWallets, wallet, publicClient, USE_ANVIL } from "../utils/wallet";

// On Base Sepolia wait for 5 confirmations; on local anvil just 1 (auto-mine)
const CONFIRMATIONS = USE_ANVIL ? 1 : 5;

describe("ConfidentialLottery Tests", function () {
  let tokenAddress: Address;
  let lotteryAddress: Address;

  // Helper: filter ABI to get only the bytes-input version of overloaded functions
  const filterAbi = (abi: any[], name: string, inputType: string) =>
    abi.filter(
      (item: any) =>
        item.type === "function" &&
        item.name === name &&
        item.inputs?.some((input: any) => input.type === inputType)
    );

  // Helper: wait for co-validator processing
  const waitForCovalidator = () =>
    new Promise((resolve) => setTimeout(resolve, 5000));

  // Helper: wait for RPC state sync after write
  const waitForSync = () =>
    new Promise((resolve) => setTimeout(resolve, 5000));

  // Deploy once for all tests to avoid nonce issues on live testnets
  before(async function () {
    console.log("\n=== Deploying ConfidentialLottery contracts ===");

    // 1. Deploy ConfidentialERC20 token
    const tokenTxHash = await wallet.deployContract({
      abi: confidentialERC20Abi.abi,
      bytecode: confidentialERC20Abi.bytecode as HexString,
      args: [],
    });
    const tokenReceipt = await publicClient.waitForTransactionReceipt({
      hash: tokenTxHash,
    });
    tokenAddress = tokenReceipt.contractAddress as Address;
    console.log(`Token deployed at: ${tokenAddress}`);

    // 2. Deploy ConfidentialLottery with token address
    const lotteryTxHash = await wallet.deployContract({
      abi: confidentialLotteryAbi.abi,
      bytecode: confidentialLotteryAbi.bytecode as HexString,
      args: [tokenAddress],
    });
    const lotteryReceipt = await publicClient.waitForTransactionReceipt({
      hash: lotteryTxHash,
    });
    lotteryAddress = lotteryReceipt.contractAddress as Address;
    console.log(`Lottery deployed at: ${lotteryAddress}`);

    // 3. Fund test wallets
    for (const [name, userWallet] of Object.entries(namedWallets)) {
      const balance = await publicClient.getBalance({
        address: userWallet.account?.address as Address,
      });
      const balanceEth = Number(formatEther(balance));

      // 0.05 ETH headroom — covers several rc-5 encrypted ops per named wallet
      // (rc-5 ops are ~5x gas-heavier than 0.7.x; the public anvil seed is also drained globally).
      if (balanceEth < 0.05) {
        const neededEth = 0.05 - balanceEth;
        console.log(`Funding ${name} with ${neededEth.toFixed(6)} ETH...`);
        const tx = await wallet.sendTransaction({
          to: userWallet.account?.address as Address,
          value: parseEther(neededEth.toFixed(6)),
        });
        // Funding is a value transfer — 1 confirmation is fine.
        await publicClient.waitForTransactionReceipt({ hash: tx });
      }
    }

    console.log("=== Setup complete ===\n");
  });

  // ======================== Helpers ========================

  async function mintAndApproveForUser(
    userWallet: ReturnType<typeof import("viem").createWalletClient>,
    amount: bigint
  ) {
    const userAddress = userWallet.account?.address as Address;
    const fee = await getFee();

    // User mints tokens via encryptedMint
    const encryptedAmount = await encryptValue({
      value: amount,
      address: userAddress,
      contractAddress: tokenAddress,
    });

    const mintTx = await userWallet.writeContract({
      address: tokenAddress,
      abi: confidentialERC20Abi.abi,
      functionName: "encryptedMint",
      args: [encryptedAmount],
      value: fee,
      account: userWallet.account!,
      chain: userWallet.chain,
    });
    await publicClient.waitForTransactionReceipt({
      hash: mintTx,
      confirmations: CONFIRMATIONS,
    });
    await waitForCovalidator();

    // User approves lottery contract to spend their tokens
    const encryptedApproval = await encryptValue({
      value: amount,
      address: userAddress,
      contractAddress: tokenAddress,
    });

    const approveAbi = filterAbi(confidentialERC20Abi.abi, "approve", "bytes");
    const approveTx = await userWallet.writeContract({
      address: tokenAddress,
      abi: approveAbi,
      functionName: "approve",
      args: [lotteryAddress, encryptedApproval],
      value: fee,
      account: userWallet.account!,
      chain: userWallet.chain,
    });
    await publicClient.waitForTransactionReceipt({ hash: approveTx });
    await waitForCovalidator();
  }

  async function depositIntoLottery(
    userWallet: ReturnType<typeof import("viem").createWalletClient>,
    amount: bigint
  ) {
    const userAddress = userWallet.account?.address as Address;
    const fee = await getFee();

    const encryptedAmount = await encryptValue({
      value: amount,
      address: userAddress,
      contractAddress: lotteryAddress,
    });

    const depositTx = await userWallet.writeContract({
      address: lotteryAddress,
      abi: confidentialLotteryAbi.abi,
      functionName: "deposit",
      args: [encryptedAmount],
      value: fee,
      account: userWallet.account!,
      chain: userWallet.chain,
    });
    await publicClient.waitForTransactionReceipt({ hash: depositTx });
    await waitForCovalidator();
  }

  // ======================== Round Management Tests ========================

  describe("----------- Round Management -----------", function () {
    it("Should start a new round", async function () {
      this.timeout(30000);
      console.log("\nStarting a new lottery round");

      const txHash = await wallet.writeContract({
        address: lotteryAddress,
        abi: confidentialLotteryAbi.abi,
        functionName: "startRound",
        args: [3600, 2, 10],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      console.log(`startRound tx status: ${receipt.status}`);
      expect(receipt.status).to.equal("success");

      // Wait for RPC nodes to sync state
      await waitForSync();

      const state = await publicClient.readContract({
        address: getAddress(lotteryAddress),
        abi: confidentialLotteryAbi.abi,
        functionName: "state",
      });
      const round = await publicClient.readContract({
        address: getAddress(lotteryAddress),
        abi: confidentialLotteryAbi.abi,
        functionName: "currentRound",
      });

      console.log(`Round ${round} started, state: ${state}`);
      expect(Number(state)).to.equal(1); // AcceptingDeposits
      expect(Number(round)).to.equal(1);
    });

    it("Should revert startRound when already active", async function () {
      console.log("\nTesting double startRound revert");

      // Round is already active from previous test
      try {
        const txHash = await wallet.writeContract({
          address: lotteryAddress,
          abi: confidentialLotteryAbi.abi,
          functionName: "startRound",
          args: [3600, 2, 10],
        });
        await publicClient.waitForTransactionReceipt({ hash: txHash });
        expect.fail("Should have reverted");
      } catch (error: any) {
        console.log("Reverted as expected");
      }
    });

    it("Should cancel a round and start a new one", async function () {
      this.timeout(30000);
      console.log("\nCancelling round and starting fresh");

      // Cancel the active round
      const cancelTx = await wallet.writeContract({
        address: lotteryAddress,
        abi: confidentialLotteryAbi.abi,
        functionName: "cancelRound",
      });
      const cancelReceipt = await publicClient.waitForTransactionReceipt({ hash: cancelTx });
      expect(cancelReceipt.status).to.equal("success");
      await waitForSync();

      const state = await publicClient.readContract({
        address: getAddress(lotteryAddress),
        abi: confidentialLotteryAbi.abi,
        functionName: "state",
      });
      const cancelled = await publicClient.readContract({
        address: getAddress(lotteryAddress),
        abi: confidentialLotteryAbi.abi,
        functionName: "roundCancelled",
        args: [1],
      });

      console.log(`State after cancel: ${state}, cancelled: ${cancelled}`);
      expect(Number(state)).to.equal(0); // Inactive
      expect(cancelled).to.equal(true);
    });
  });

  // ======================== Full Flow Test ========================

  describe("----------- Full Lottery Flow: Deposit → Draw → Claim -----------", function () {
    it("Should run a complete lottery round with attestation-based claim", async function () {
      this.timeout(300000); // 5 min timeout for live testnet

      // ---- Step 1: Start round ----
      console.log("\n--- Step 1: Starting round ---");
      const startTx = await wallet.writeContract({
        address: lotteryAddress,
        abi: confidentialLotteryAbi.abi,
        functionName: "startRound",
        args: [3600, 2, 10],
      });
      const startReceipt = await publicClient.waitForTransactionReceipt({ hash: startTx });
      console.log(`startRound tx status: ${startReceipt.status}`);
      expect(startReceipt.status).to.equal("success");
      await waitForSync();

      const round = await publicClient.readContract({
        address: getAddress(lotteryAddress),
        abi: confidentialLotteryAbi.abi,
        functionName: "currentRound",
      });
      console.log(`Round ${round} started`);

      // ---- Step 2: Deposits ----
      console.log("\n--- Step 2: Depositing (Alice, Bob, Dave) ---");
      const depositAmount = parseEther("500");

      for (const name of ["alice", "bob", "dave"] as const) {
        console.log(`${name}: minting and approving ${formatEther(depositAmount)} cUSD...`);
        await mintAndApproveForUser(namedWallets[name], depositAmount);
        console.log(`${name}: depositing into lottery...`);
        await depositIntoLottery(namedWallets[name], depositAmount);
        console.log(`${name}: deposited successfully`);
      }

      const count = await publicClient.readContract({
        address: getAddress(lotteryAddress),
        abi: confidentialLotteryAbi.abi,
        functionName: "getParticipantCount",
      });
      console.log(`Total participants: ${count}`);
      expect(Number(count)).to.equal(3);

      // Verify Alice can decrypt her deposit
      const aliceDepositHandle = (await publicClient.readContract({
        address: getAddress(lotteryAddress),
        abi: confidentialLotteryAbi.abi,
        functionName: "getMyDeposit",
        account: namedWallets.alice.account?.address as Address,
      })) as HexString;

      const aliceDeposit = await decryptValue({
        walletClient: namedWallets.alice,
        handle: aliceDepositHandle.toString(),
      });
      console.log(`Alice's decrypted deposit: ${formatEther(aliceDeposit)} cUSD`);
      expect(aliceDeposit).to.equal(depositAmount);

      // ---- Step 3: Draw winner ----
      console.log("\n--- Step 3: Drawing winner ---");
      const drawFee = await getFee();
      const drawTx = await wallet.writeContract({
        address: lotteryAddress,
        abi: confidentialLotteryAbi.abi,
        functionName: "drawWinner",
        value: drawFee,
      });
      const drawReceipt = await publicClient.waitForTransactionReceipt({ hash: drawTx });
      console.log(`drawWinner tx status: ${drawReceipt.status}`);
      expect(drawReceipt.status).to.equal("success");
      await waitForCovalidator();

      const stateAfterDraw = await publicClient.readContract({
        address: getAddress(lotteryAddress),
        abi: confidentialLotteryAbi.abi,
        functionName: "state",
      });
      console.log(`State after draw: ${stateAfterDraw} (should be 2 = Claimable)`);
      expect(Number(stateAfterDraw)).to.equal(2);

      // ---- Step 4: Each participant checks their winner status via attestedDecrypt ----
      console.log("\n--- Step 4: Checking winner status via attestedDecrypt ---");
      let winnerName = "";
      let winnerAttestation: any = null;

      for (const name of ["alice", "bob", "dave"] as const) {
        const winnerCheckHandle = (await publicClient.readContract({
          address: getAddress(lotteryAddress),
          abi: confidentialLotteryAbi.abi,
          functionName: "getMyWinnerCheck",
          args: [round],
          account: namedWallets[name].account?.address as Address,
        })) as HexString;

        const attestation = await getDecryptionAttestation({
          walletClient: namedWallets[name],
          handle: winnerCheckHandle.toString(),
        });

        const isWinner = attestation.plaintext === 1n;
        console.log(`${name}: ${isWinner ? "WINNER!" : "not winner"}`);

        if (isWinner) {
          winnerName = name;
          winnerAttestation = attestation;
        }
      }

      expect(winnerName).to.not.equal("");
      console.log(`\nWinner: ${winnerName}`);

      // ---- Step 5: Winner claims prize with DecryptionAttestation ----
      console.log("\n--- Step 5: Winner claiming prize with attestation ---");
      const winnerWallet = namedWallets[winnerName as keyof typeof namedWallets];

      const claimTx = await winnerWallet.writeContract({
        address: lotteryAddress,
        abi: confidentialLotteryAbi.abi,
        functionName: "claimPrize",
        args: [
          {
            handle: winnerAttestation.decryption.handle,
            value: winnerAttestation.decryption.value,
          },
          winnerAttestation.signatures,
        ],
        account: winnerWallet.account!,
        chain: winnerWallet.chain,
      });
      await publicClient.waitForTransactionReceipt({ hash: claimTx });
      await waitForCovalidator();

      // Verify winner's token balance = 1500 cUSD (full lottery: 3 * 500)
      const winnerBalanceHandle = (await publicClient.readContract({
        address: getAddress(tokenAddress),
        abi: confidentialERC20Abi.abi,
        functionName: "balanceOf",
        args: [winnerWallet.account?.address as Address],
      })) as HexString;

      const winnerBalance = await decryptValue({
        walletClient: winnerWallet,
        handle: winnerBalanceHandle.toString(),
      });
      console.log(`Winner (${winnerName}) balance: ${formatEther(winnerBalance)} cUSD`);
      expect(winnerBalance).to.equal(parseEther("1500"));

      // Verify prize marked as claimed
      const claimed = await publicClient.readContract({
        address: getAddress(lotteryAddress),
        abi: confidentialLotteryAbi.abi,
        functionName: "prizeClaimed",
        args: [round],
      });
      expect(claimed).to.equal(true);
      console.log("Prize claimed successfully!");

      // ---- Step 6: Non-winner attestation should revert ----
      console.log("\n--- Step 6: Verifying non-winner cannot claim ---");
      const nonWinnerName = winnerName === "alice" ? "bob" : "alice";
      const nonWinnerWallet = namedWallets[nonWinnerName as keyof typeof namedWallets];

      const nonWinnerHandle = (await publicClient.readContract({
        address: getAddress(lotteryAddress),
        abi: confidentialLotteryAbi.abi,
        functionName: "getMyWinnerCheck",
        args: [round],
        account: nonWinnerWallet.account?.address as Address,
      })) as HexString;

      const nonWinnerAttestation = await getDecryptionAttestation({
        walletClient: nonWinnerWallet,
        handle: nonWinnerHandle.toString(),
      });

      try {
        await nonWinnerWallet.writeContract({
          address: lotteryAddress,
          abi: confidentialLotteryAbi.abi,
          functionName: "claimPrize",
          args: [
            {
              handle: nonWinnerAttestation.decryption.handle,
              value: nonWinnerAttestation.decryption.value,
            },
            nonWinnerAttestation.signatures,
          ],
          account: nonWinnerWallet.account!,
          chain: nonWinnerWallet.chain,
        });
        expect.fail("Should have reverted");
      } catch (error: any) {
        // On live testnet the revert reason can be AlreadyClaimed or NotWinner
        console.log(`Non-winner claim reverted as expected`);
      }

      // ---- Step 7: End round ----
      console.log("\n--- Step 7: Ending round ---");
      const endTx = await wallet.writeContract({
        address: lotteryAddress,
        abi: confidentialLotteryAbi.abi,
        functionName: "endRound",
      });
      const endReceipt = await publicClient.waitForTransactionReceipt({ hash: endTx });
      console.log(`endRound tx status: ${endReceipt.status}`);
      expect(endReceipt.status).to.equal("success");
      await waitForSync();

      const finalState = await publicClient.readContract({
        address: getAddress(lotteryAddress),
        abi: confidentialLotteryAbi.abi,
        functionName: "state",
      });
      expect(Number(finalState)).to.equal(0); // Inactive
      console.log("\nRound completed successfully!");
    });
  });

  // ======================== Refund Test ========================

  describe("----------- Refund Flow -----------", function () {
    it("Should refund deposits after round cancellation", async function () {
      this.timeout(300000);
      console.log("\n--- Testing refund after cancellation ---");

      // Wait for any pending state from previous tests to propagate
      await waitForSync();

      // Ensure lottery is Inactive (previous test may have left it in a different state)
      const currentState = await publicClient.readContract({
        address: getAddress(lotteryAddress),
        abi: confidentialLotteryAbi.abi,
        functionName: "state",
      });
      if (Number(currentState) !== 0) {
        console.log(`Lottery is in state ${currentState}, resetting to Inactive...`);
        // Cancel if AcceptingDeposits, or endRound if Claimable
        const resetFn = Number(currentState) === 1 ? "cancelRound" : "endRound";
        const resetTx = await wallet.writeContract({
          address: lotteryAddress,
          abi: confidentialLotteryAbi.abi,
          functionName: resetFn,
        });
        await publicClient.waitForTransactionReceipt({ hash: resetTx });
        await waitForSync();
      }

      // Start a new round
      const startTx = await wallet.writeContract({
        address: lotteryAddress,
        abi: confidentialLotteryAbi.abi,
        functionName: "startRound",
        args: [3600, 2, 10],
      });
      const startReceipt = await publicClient.waitForTransactionReceipt({ hash: startTx });
      expect(startReceipt.status).to.equal("success");
      await waitForSync();

      const round = await publicClient.readContract({
        address: getAddress(lotteryAddress),
        abi: confidentialLotteryAbi.abi,
        functionName: "currentRound",
      });
      console.log(`Round ${round} started for refund test`);

      const depositAmount = parseEther("1000");

      // Carol deposits
      console.log("Carol minting and depositing 1000 cUSD...");
      await mintAndApproveForUser(namedWallets.carol, depositAmount);
      await depositIntoLottery(namedWallets.carol, depositAmount);
      console.log("Carol deposited");

      // Verify Carol's token balance is 0 after deposit
      const balanceBefore = (await publicClient.readContract({
        address: getAddress(tokenAddress),
        abi: confidentialERC20Abi.abi,
        functionName: "balanceOf",
        args: [namedWallets.carol.account?.address as Address],
      })) as HexString;

      const balBeforeDecrypted = await decryptValue({
        walletClient: namedWallets.carol,
        handle: balanceBefore.toString(),
      });
      console.log(`Carol balance after deposit: ${formatEther(balBeforeDecrypted)} cUSD`);
      expect(balBeforeDecrypted).to.equal(0n);

      // Owner cancels the round
      const cancelTx = await wallet.writeContract({
        address: lotteryAddress,
        abi: confidentialLotteryAbi.abi,
        functionName: "cancelRound",
      });
      const cancelReceipt = await publicClient.waitForTransactionReceipt({ hash: cancelTx });
      expect(cancelReceipt.status).to.equal("success");
      await waitForSync();
      console.log("Round cancelled by owner");

      // Carol claims refund
      const refundTx = await namedWallets.carol.writeContract({
        address: lotteryAddress,
        abi: confidentialLotteryAbi.abi,
        functionName: "refund",
        args: [round],
        account: namedWallets.carol.account!,
        chain: namedWallets.carol.chain,
      });
      await publicClient.waitForTransactionReceipt({ hash: refundTx });
      await waitForCovalidator();

      // Verify Carol got tokens back
      const balanceAfter = (await publicClient.readContract({
        address: getAddress(tokenAddress),
        abi: confidentialERC20Abi.abi,
        functionName: "balanceOf",
        args: [namedWallets.carol.account?.address as Address],
      })) as HexString;

      const balAfterDecrypted = await decryptValue({
        walletClient: namedWallets.carol,
        handle: balanceAfter.toString(),
      });
      console.log(`Carol balance after refund: ${formatEther(balAfterDecrypted)} cUSD`);
      expect(balAfterDecrypted).to.equal(depositAmount);
    });
  });
});
