# Inco Lite - Hardhat Template

This template provides a **Hardhat setup** for developing, testing, and deploying **confidential smart contracts** on the Inco network — encryption, reencryption, decryption, and ciphertext formation.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) installed (for the local node)
- [Node.js](https://nodejs.org/) >= 18

## Setup

### 1. Install dependencies
```sh
npm install
```

### 2. Configure environment variables
```sh
cp .env.sample .env
```
`.env` ships with the well-known Anvil key (`PRIVATE_KEY_ANVIL`) for local use. Before deploying to a live network, fill in `PRIVATE_KEY_BASE_SEPOLIA` / `BASE_SEPOLIA_RPC_URL` (and `PRIVATE_KEY_BASE` / `BASE_RPC_URL` for mainnet). Each network in `hardhat.config.ts` reads its own key:

```plaintext
# Local Anvil (well-known default key — safe for local dev only!)
PRIVATE_KEY_ANVIL=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# Base Sepolia (testnet)
PRIVATE_KEY_BASE_SEPOLIA=
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org

# Base Mainnet
PRIVATE_KEY_BASE=
BASE_RPC_URL=https://mainnet.base.org
```

### 3. Run a local node

Start the local Inco node and covalidator. Skip this if you only target a live network like Base Sepolia.
```sh
npm run node      # docker compose up
```

### 4. Compile
```sh
npm run compile   # hardhat compile
```

### 5. Run tests
```sh
npm run test:local     # against the local anvil node
npm run test:testnet   # against Base Sepolia
```

## Deploy

Deployments use [Hardhat Ignition](https://hardhat.org/ignition); each network reads its key from `.env`.

```sh
npm run deploy:local     # local Inco anvil node (start `npm run node` first)
npm run deploy:testnet   # Base Sepolia
npm run deploy:mainnet   # Base Mainnet
```

> These deploy `ConfidentialERC20` **and** `ConfidentialLottery`. To deploy only the token, use the `deploy:token:local` / `deploy:token:testnet` / `deploy:token:mainnet` variants.

## Features

- End-to-end encryption, reencryption, and decryption flows
- Hardhat + viem test framework with local-node and testnet targets
- Hardhat Ignition deployments to local node, Base Sepolia, and Base Mainnet
- Local node with Docker Compose
