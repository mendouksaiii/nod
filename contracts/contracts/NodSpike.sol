// SPDX-License-Identifier: MIT

pragma solidity ^0.8.30;

import { e, euint256, inco } from "@inco/lightning/src/Lib.sol";

/// @title NodSpike — Section 1 technical spike for NOD
/// @notice Proves the two properties the game is built on:
///  1. A per-player encrypted seed only that player's wallet can decrypt.
///  2. A house secret no wallet can decrypt — it exists onchain, provably unreadable.
contract NodSpike {
    /// Sealed once after deploy; access granted to no one. The sealed door.
    euint256 private _houseSecret;
    bool public houseSealed;

    mapping(address => euint256) private _childSeed;
    mapping(address => bool) public hasEntered;

    event ChildEntered(address indexed child);
    event HouseSealed();

    error AlreadyEntered();
    error NeverEntered();
    error InsufficientFee();
    error AlreadySealed();

    /// @notice One-time: mint the house's sealed secret. Payable because
    ///         encrypted ops (e.rand) charge the Inco executor fee — which is
    ///         also why this cannot live in the constructor.
    function sealHouse() external payable {
        if (houseSealed) revert AlreadySealed();
        if (msg.value < inco.getFee()) revert InsufficientFee();

        _houseSecret = e.rand();
        e.allowThis(_houseSecret);
        houseSealed = true;

        emit HouseSealed();
    }

    /// @notice "The house learns your name." Mints an encrypted run seed
    ///         decryptable only by the caller (and the contract).
    function enterHouse() external payable {
        if (hasEntered[msg.sender]) revert AlreadyEntered();
        if (msg.value < inco.getFee()) revert InsufficientFee();

        euint256 seed = e.rand();
        e.allowThis(seed);
        e.allow(seed, msg.sender);

        _childSeed[msg.sender] = seed;
        hasEntered[msg.sender] = true;

        emit ChildEntered(msg.sender);
    }

    /// @notice Handle to your own seed — decryptable via attestedDecrypt only
    ///         by the wallet that entered.
    function mySeed() external view returns (euint256) {
        if (!hasEntered[msg.sender]) revert NeverEntered();
        return _childSeed[msg.sender];
    }

    /// @notice Handle to another child's seed. Anyone can read the handle;
    ///         decryption fails for everyone but its owner. That is the point.
    function seedOf(address child) external view returns (euint256) {
        if (!hasEntered[child]) revert NeverEntered();
        return _childSeed[child];
    }

    /// @notice Handle to the house's sealed secret. No wallet holds decrypt
    ///         rights — attestedDecrypt must fail for every caller.
    function houseSecret() external view returns (euint256) {
        return _houseSecret;
    }
}
