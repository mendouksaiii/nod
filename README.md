# nod

A full-stack Inco dApp with Hardhat and RainbowKit.

This template includes example contracts that demonstrate core confidential patterns:

### Confidential ERC20 (`ConfidentialERC20.sol`)
A token where **balances and transfer amounts are encrypted**. Unlike standard ERC20 tokens where anyone can see how much you hold and send, confidential tokens keep this data private.

**Flow:**
1. The owner mints tokens — the amount is converted to an encrypted `euint256` and added to their encrypted balance
2. A user transfers tokens by submitting an encrypted amount — the contract checks `sender balance >= amount` **entirely in ciphertext** using `e.ge()`, then updates both balances without revealing any values on-chain
3. Approvals and `transferFrom` work the same way — allowances are encrypted, and the contract verifies both balance and allowance conditions in encrypted space using `e.select()`
4. Only the token holder (or addresses they explicitly `e.allow()`) can decrypt and view their own balance

### Confidential Lottery (`ConfidentialLottery.sol`)
A lottery where **deposit amounts are hidden** and the **winner is selected using on-chain encrypted randomness**. No one can see who won until the winner claims.

**Flow:**
1. The owner starts a round with a duration, min/max participants
2. Participants deposit encrypted token amounts via `deposit()` — each deposit is stored as an `euint256` and added to an encrypted pot (`_lotteryBalance`), so no one can see how much anyone deposited or the total pot size
3. Once enough participants have joined, anyone can call `drawWinner()` — the contract generates a random encrypted index using `e.randBounded()` and creates an encrypted boolean (`ebool`) for each participant indicating whether they won
4. Each participant can privately decrypt their `ebool` off-chain to check if they're the winner — only the winner sees `true`
5. The winner calls `claimPrize()` with a **decryption attestation** (a cryptographic proof from the Inco covalidator) to prove they won, and the entire pot is transferred to them
6. If the round is cancelled, participants can call `refund()` to get their encrypted deposit back


## Project Structure

```
nod/
├── contracts/     # Solidity smart contracts (Hardhat)
├── frontend/            # Next.js frontend with RainbowKit
└── package.json         # Workspace configuration
```

## Getting Started

### Install Dependencies

```bash
npm install
```

### Start Development

```bash
# Start the frontend
npm run dev

# Compile contracts
npm run contracts:compile

# Run contract tests
npm run contracts:test
```

## Learn More

- [Inco Documentation](https://docs.inco.org)
- [Hardhat Documentation](https://hardhat.org/docs)
