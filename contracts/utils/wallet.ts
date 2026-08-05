import { createWalletClient, createPublicClient, http , type Address} from "viem";
import { privateKeyToAccount, mnemonicToAccount, generatePrivateKey } from "viem/accounts";
import { baseSepolia, anvil } from "viem/chains";
import * as dotenv from "dotenv";
import { HexString } from "@inco/lightning-js";

dotenv.config();

// Well-known default anvil private key and mnemonic (account #0) — safe for local dev only
const DEFAULT_ANVIL_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const DEFAULT_ANVIL_MNEMONIC = "test test test test test test test test test test test junk";

// Determine whether to use Anvil (local) or Base Sepolia by reading Hardhat's runtime environment
import { network } from "hardhat";
const networkName = network.name;
export const USE_ANVIL = networkName === "anvil";
console.log(`Detected network: ${networkName}`);

// Choose chain and RPC URL based on network
const chain = USE_ANVIL ? anvil : baseSepolia;
const rpcUrl = USE_ANVIL
  ? process.env.LOCAL_CHAIN_RPC_URL || "http://localhost:8545"
  : process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";

// Load and validate PRIVATE_KEY based on selected network
// For anvil, fall back to the well-known default key if not set in .env
const PRIVATE_KEY_ENV = USE_ANVIL
  ? (process.env.PRIVATE_KEY_ANVIL || DEFAULT_ANVIL_PRIVATE_KEY)
  : process.env.PRIVATE_KEY_BASE_SEPOLIA;
if (!PRIVATE_KEY_ENV) {
  throw new Error(
    `Missing PRIVATE_KEY_BASE_SEPOLIA in .env file`
  );
}
const PRIVATE_KEY = PRIVATE_KEY_ENV.startsWith("0x")
  ? (PRIVATE_KEY_ENV as HexString)
  : (`0x${PRIVATE_KEY_ENV}` as HexString);
if (PRIVATE_KEY.length !== 66) {
  throw new Error("Invalid private key length in .env file");
}

// Create account from private key
const account = privateKeyToAccount(PRIVATE_KEY);

// Public client (read-only)
export const publicClient = createPublicClient({
  chain,
  transport: http(rpcUrl),
});

// Wallet client (signing)
export const wallet = createWalletClient({
  account,
  chain,
  transport: http(rpcUrl),
});


// Named wallets.
// For local Anvil we derive from a mnemonic (deterministic addresses are convenient when
// re-running tests against a persistent local node). For testnet we generate FRESH random
// private keys each test run — the well-known anvil mnemonic addresses are MEV-drained on
// public testnets within seconds, so any shared/deterministic seed is unusable there.
function createNamedWallet(path: string) {
  const account = USE_ANVIL
    ? mnemonicToAccount(process.env.SEED_PHRASE || DEFAULT_ANVIL_MNEMONIC, { path })
    : privateKeyToAccount(generatePrivateKey());
  return createWalletClient({ account, chain, transport: http(rpcUrl) });
}

export const namedWallets: Record<string, ReturnType<typeof createWalletClient>> = {
  alice: createNamedWallet("m/44'/60'/0'/0/0"),
  bob: createNamedWallet("m/44'/60'/0'/0/1"),
  dave: createNamedWallet("m/44'/60'/0'/0/2"),
  carol: createNamedWallet("m/44'/60'/0'/0/3"),
  john: createNamedWallet("m/44'/60'/0'/0/4"),
};

console.log("Named wallets created:");
Object.entries(namedWallets).forEach(([name, client]) => {
  console.log(`   - ${name}: ${client.account?.address as Address}`);
});
