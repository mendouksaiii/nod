// SPDX-License-Identifier: MIT

pragma solidity ^0.8.30;

import { e, ebool, euint256, inco } from "@inco/lightning/src/Lib.sol";
import { DecryptionAttestation } from "@inco/lightning/src/lightning-parts/DecryptionAttester.types.sol";
import { asBool } from "@inco/lightning/src/shared/TypeUtils.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";

interface IConfidentialERC20 {
    function transfer(address to, euint256 amount) external returns (bool);
    function transferFrom(address from, address to, euint256 amount) external returns (bool);
    function balanceOf(address wallet) external view returns (euint256);
}

contract ConfidentialLottery is Ownable2Step {

    enum LotteryState { Inactive, AcceptingDeposits, Claimable }

    IConfidentialERC20 public immutable token;

    uint256 public currentRound;
    LotteryState public state;
    uint256 public depositDeadline;
    uint256 public maxParticipants;
    uint256 public minParticipants;

    address[] internal _participants;
    mapping(uint256 => mapping(address => bool)) public hasDeposited;
    mapping(uint256 => mapping(address => euint256)) internal _deposits;
    mapping(uint256 => mapping(address => uint256)) internal _participantIndex;
    euint256 internal _lotteryBalance;

    euint256 internal _winnerIndex;
    mapping(uint256 => mapping(address => ebool)) internal _winnerCheck;
    mapping(uint256 => bool) public roundCancelled;
    mapping(uint256 => bool) public prizeClaimed;

    event RoundStarted(
        uint256 indexed round,
        uint256 deadline,
        uint256 minParticipants,
        uint256 maxParticipants
    );
    event Deposited(address indexed participant, uint256 indexed round);
    event WinnerDrawn(uint256 indexed round, uint256 participantCount);
    event PrizeClaimed(address indexed winner, uint256 indexed round);
    event RoundEnded(uint256 indexed round);
    event RoundCancelled(uint256 indexed round);
    event DepositRefunded(address indexed participant, uint256 indexed round);

    error InvalidState();
    error AlreadyDeposited();
    error LotteryFull();
    error DepositPhaseClosed();
    error NotEnoughParticipants();
    error NotAParticipant();
    error InsufficientFees();
    error RoundNotCancelled();
    error InvalidRoundConfig();
    error InvalidAttestation();
    error HandleMismatch();
    error NotWinner();
    error AlreadyClaimed();

    constructor(address _token) Ownable(msg.sender) {
        token = IConfidentialERC20(_token);
    }

    function _requireFee() internal view {
        if (msg.value < inco.getFee()) revert InsufficientFees();
    }

    // ── Admin ────────────────────────────────────────────────

    function startRound(
        uint256 duration,
        uint256 _minParticipants,
        uint256 _maxParticipants
    ) external onlyOwner {
        if (state != LotteryState.Inactive) revert InvalidState();
        if (_minParticipants < 2 || _maxParticipants < _minParticipants) {
            revert InvalidRoundConfig();
        }

        currentRound++;
        state = LotteryState.AcceptingDeposits;
        depositDeadline = block.timestamp + duration;
        minParticipants = _minParticipants;
        maxParticipants = _maxParticipants;

        _lotteryBalance = e.asEuint256(0);
        e.allow(_lotteryBalance, address(this));
        delete _participants;

        emit RoundStarted(currentRound, depositDeadline, _minParticipants, _maxParticipants);
    }

    function cancelRound() external onlyOwner {
        if (state == LotteryState.Inactive) revert InvalidState();

        roundCancelled[currentRound] = true;
        state = LotteryState.Inactive;
        emit RoundCancelled(currentRound);
    }

    error PrizeNotClaimed();

    function endRound() external onlyOwner {
        if (state != LotteryState.Claimable) revert InvalidState();
        if (!prizeClaimed[currentRound]) revert PrizeNotClaimed();

        state = LotteryState.Inactive;
        emit RoundEnded(currentRound);
    }

    // ── User Actions ─────────────────────────────────────────

    /// @notice Deposit encrypted tokens. Approve this contract on the token first.
    function deposit(bytes calldata encryptedAmount) external payable {
        if (state != LotteryState.AcceptingDeposits) revert InvalidState();
        if (hasDeposited[currentRound][msg.sender]) revert AlreadyDeposited();
        if (_participants.length >= maxParticipants) revert LotteryFull();
        if (block.timestamp > depositDeadline) revert DepositPhaseClosed();
        _requireFee();

        euint256 amount = e.newEuint256(encryptedAmount, msg.sender);
        e.allow(amount, address(this));
        e.allow(amount, address(token));

        token.transferFrom(msg.sender, address(this), amount);

        _deposits[currentRound][msg.sender] = amount;
        e.allow(_deposits[currentRound][msg.sender], address(this));
        e.allow(_deposits[currentRound][msg.sender], msg.sender);

        _participantIndex[currentRound][msg.sender] = _participants.length;
        _participants.push(msg.sender);
        hasDeposited[currentRound][msg.sender] = true;

        _lotteryBalance = e.add(_lotteryBalance, amount);
        e.allow(_lotteryBalance, address(this));
        e.allow(_lotteryBalance, owner());

        emit Deposited(msg.sender, currentRound);
    }

    /// @notice Draw a random winner. Each participant gets an ebool they can
    ///         privately decrypt via attestedDecrypt to learn if they won.
    function drawWinner() external payable {
        if (state != LotteryState.AcceptingDeposits) revert InvalidState();
        if (_participants.length < minParticipants) revert NotEnoughParticipants();
        _requireFee();

        uint256 count = _participants.length;

        _winnerIndex = e.randBounded(count);
        e.allow(_winnerIndex, address(this));

        for (uint256 i = 0; i < count; i++) {
            ebool check = e.eq(_winnerIndex, e.asEuint256(i));
            _winnerCheck[currentRound][_participants[i]] = check;
            e.allow(_winnerCheck[currentRound][_participants[i]], _participants[i]);
            e.allow(_winnerCheck[currentRound][_participants[i]], address(this));
        }

        e.reveal(_lotteryBalance);

        state = LotteryState.Claimable;
        emit WinnerDrawn(currentRound, count);
    }

    /// @notice Claim prize with a DecryptionAttestation proving you won.
    ///         Verify your ebool via attestedDecrypt off-chain, then submit here.
    function claimPrize(
        DecryptionAttestation memory decryption,
        bytes[] memory signatures
    ) external {
        if (state != LotteryState.Claimable) revert InvalidState();
        if (!hasDeposited[currentRound][msg.sender]) revert NotAParticipant();
        if (prizeClaimed[currentRound]) revert AlreadyClaimed();

        if (!inco.incoVerifier().isValidDecryptionAttestation(decryption, signatures)) {
            revert InvalidAttestation();
        }

        ebool myWinnerCheck = _winnerCheck[currentRound][msg.sender];
        if (ebool.unwrap(myWinnerCheck) != decryption.handle) revert HandleMismatch();
        if (!asBool(decryption.value)) revert NotWinner();

        prizeClaimed[currentRound] = true;
        e.allow(_lotteryBalance, address(token));
        token.transfer(msg.sender, _lotteryBalance);

        _lotteryBalance = e.asEuint256(0);
        e.allow(_lotteryBalance, address(this));

        emit PrizeClaimed(msg.sender, currentRound);
    }

    /// @notice Refund deposit from a cancelled round.
    function refund(uint256 round) external {
        if (!roundCancelled[round]) revert RoundNotCancelled();
        if (!hasDeposited[round][msg.sender]) revert NotAParticipant();

        euint256 depositAmount = _deposits[round][msg.sender];

        hasDeposited[round][msg.sender] = false;
        _deposits[round][msg.sender] = e.asEuint256(0);

        e.allow(depositAmount, address(token));
        token.transfer(msg.sender, depositAmount);

        emit DepositRefunded(msg.sender, round);
    }

    // ── Views ────────────────────────────────────────────────

    function getParticipantCount() external view returns (uint256) {
        return _participants.length;
    }

    function getParticipants() external view returns (address[] memory) {
        return _participants;
    }

    function getMyDeposit() external view returns (euint256) {
        return _deposits[currentRound][msg.sender];
    }

    function getLotteryBalance() external view returns (euint256) {
        return _lotteryBalance;
    }

    function getMyWinnerCheck(uint256 round) external view returns (ebool) {
        return _winnerCheck[round][msg.sender];
    }
}
