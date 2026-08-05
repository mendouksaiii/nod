import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox-viem";
import * as dotenv from "dotenv";

dotenv.config(); // Load environment variables

const PRIVATE_KEY = process.env.PRIVATE_KEY_BASE_SEPOLIA || "";
const PRIVATE_KEY_ANVIL = process.env.PRIVATE_KEY_ANVIL || "";
// No fallback to the Sepolia key — mainnet must use its own key, otherwise the `base`
// network has no signer and Hardhat fails clearly (prevents accidental mainnet deploys).
const PRIVATE_KEY_BASE = process.env.PRIVATE_KEY_BASE || "";

const BASE_SEPOLIA_RPC_URL = process.env.BASE_SEPOLIA_RPC_URL || "";
const BASE_RPC_URL = process.env.BASE_RPC_URL || "https://mainnet.base.org";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.30",  // Specify the Solidity version
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      },
      evmVersion: "cancun" // Specify the EVM version
    }
  },
  networks: {
    hardhat: {}, // Local Hardhat network
    // Inco's local node, based on anvil, called https://github.com/Inco-fhevm/lightning-rod
    // Make sure to run `docker compose up` to start the local node and covalidator
    anvil: {
      url: "http://localhost:8545",
      accounts: PRIVATE_KEY_ANVIL ? [PRIVATE_KEY_ANVIL] : [],
      chainId:31337
    },
    baseSepolia: {
      url: BASE_SEPOLIA_RPC_URL,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
    base: {
      url: BASE_RPC_URL,
      accounts: PRIVATE_KEY_BASE ? [PRIVATE_KEY_BASE] : [],
      chainId: 8453,
    }
  }
};

export default config;
