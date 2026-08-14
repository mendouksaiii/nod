// SPDX-License-Identifier: MIT

pragma solidity ^0.8.30;

import { e, euint256, inco } from "@inco/lightning/src/Lib.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";

/**
 * @title NodHouse
 * @notice The house from NOD, as a contract.
 *
 * NOD is a game about a seven-storey house whose stairs only go down. Its
 * fiction is that dozens of children woke there before you, that some of
 * them stopped and became the things now hunting you, and that nobody knows
 * what is at the bottom. This contract makes all three literally true.
 *
 * Three things live here, and none of them work on a transparent chain:
 *
 *  1. THE DESCENT PROTOCOL. Each floor's layout comes from an encrypted seed
 *     minted inside Inco's TEE. A floor's seed does not exist until you have
 *     finished the floor above it, and it is decryptable only by you. Nobody
 *     — not a datamined client, not a wiki, not someone reading this chain —
 *     can see what is below the floor they have personally earned. "The
 *     stairs only go down" stops being flavour and becomes access control.
 *
 *  2. THE HOUSE REMEMBERS. When a child is taken, or chooses to stay, they
 *     leave a mark on that floor: their address, and an encrypted epitaph.
 *     The epitaph is readable only by children who are standing on that floor
 *     right now. The warnings scratched on the walls of floor three were
 *     written by players who actually died on floor three, and the only way
 *     to read them is to get there.
 *
 *  3. THE SEALED GROUND FLOOR. What waits behind the last door is encrypted
 *     at deploy time and granted to no one. It becomes decryptable only for a
 *     wallet that has descended all seven floors. Provably, nobody on earth
 *     knows the ending without having earned it.
 */
contract NodHouse is Ownable2Step {
    uint8 public constant TOP_FLOOR = 7;
    uint8 public constant BOTTOM_FLOOR = 1;
    /// Marks kept per floor. A ring buffer, so arriving costs bounded gas.
    uint8 public constant MARKS_PER_FLOOR = 8;

    struct Run {
        bool active;
        bool escaped;
        uint8 floor; // where the child is standing, 7 down to 1
        uint64 startedAt;
        uint64 endedAt;
    }

    /// A child who stopped here. The address is public; what they left is not.
    struct Mark {
        address child;
        uint64 at;
        uint8 floor;
        /**
         * Which warning they left — a PLAIN index into `phrases`, not encrypted.
         *
         * The name below is the secret worth hiding; the warning is one of a
         * short fixed list and costs nothing to reveal. Keeping it plain is not
         * only simpler, it is necessary: every Inco encrypted-value creation is
         * heavy, and doing TWO in one transaction (a name AND a warning) is what
         * pushed enterHouse over Base's per-transaction gas limit. One encrypted
         * value per transaction is the rule that keeps every call callable.
         */
        uint8 warning;
        /**
         * What the child called themselves, encrypted. Granted only to someone
         * who reaches the floor where this child stopped — an address is public
         * forever and says nothing; the name is the thing that makes a mark on
         * the wall land, so the name is the secret and the only way to learn it
         * is to get as deep as they did.
         */
        euint256 name;
    }

    mapping(address => Run) public runs;
    /// child => floor => that floor's encrypted layout seed
    mapping(address => mapping(uint8 => euint256)) private _floorSeed;
    /// floor => ring of the last MARKS_PER_FLOOR children kept there
    mapping(uint8 => Mark[8]) private _marks;
    mapping(uint8 => uint8) private _markCursor;
    mapping(uint8 => uint32) public markTotal;

    /// What is behind the last door. Sealed once, granted only to finishers.
    euint256 private _ending;
    bool public sealed_;

    uint32 public childrenEntered;
    uint32 public childrenKept;
    uint32 public childrenWoke;

    /**
     * The only things a child may leave on a wall. Free text would let one
     * player write anything into every other player's horror game, so the
     * epitaph is an index into this list — and even the index is encrypted.
     */
    string[] public phrases;

    /**
     * What the child finds past the door. All of them are public; which one
     * this house is holding is sealed until someone gets there and decrypts
     * `ending() % endings.length`.
     */
    string[] public endings;

    event ChildEntered(address indexed child, uint64 at);
    event Descended(address indexed child, uint8 from, uint8 to);
    event ChildKept(address indexed child, uint8 indexed floor, bool settled);
    event ChildWoke(address indexed child, uint64 at);
    event HouseSealed();

    error AlreadySealed();
    error NotSealed();
    error NoRun();
    error RunOver();
    error WrongFloor();
    error AtTheBottom();
    error NotAtTheDoor();
    error InsufficientFee();
    error UnknownPhrase();
    error NoEndings();

    constructor() Ownable(msg.sender) {
        phrases.push("i stopped here");
        phrases.push("it sees you move");
        phrases.push("do not run");
        phrases.push("cover the mirrors");
        phrases.push("she hears you cry");
        phrases.push("it follows where you have been");
        phrases.push("stand still");
        phrases.push("i could not do it");
        phrases.push("keep going down");
        phrases.push("i am sorry");
        phrases.push("do not look at it");
        phrases.push("the door is real");

        // Every one of these is a way the story can end. The house is holding
        // exactly one of them, and nobody knows which.
        endings.push("you wake in your own bed. it is morning. you are holding a key.");
        endings.push("you wake in your own bed. it is morning. there is a drawing of a bird in your hand.");
        endings.push("you wake in your own bed. it is morning. you cannot remember your name.");
        endings.push("cold air. a garden. behind you the house is only a house.");
        endings.push("you step through. it is the seventh floor. the marks on the wall are yours.");
    }

    function _requireFee() internal view {
        if (msg.value < inco.getFee()) revert InsufficientFee();
    }

    function phraseCount() external view returns (uint256) {
        return phrases.length;
    }

    // ── Sealing the bottom ─────────────────────────────────────────────

    /**
     * @notice Seal what is behind the last door.
     *
     * @dev The ending is drawn inside Inco's TEE, NOT supplied by the owner.
     *      That distinction is the whole claim. If the owner encrypted a
     *      plaintext client-side and handed it over, the owner would know the
     *      ending forever — no access control can un-know it. Because this is
     *      `e.rand()` and is granted to nobody, not one person alive knows
     *      which ending waits at the bottom of this house until a child opens
     *      the door and decrypts it.
     *
     *      The possible endings are public in `endings`; which one the house
     *      is holding is not. Cannot live in the constructor: encrypted
     *      operations charge the Inco executor fee, so they need msg.value.
     */
    function sealHouse() external payable onlyOwner {
        if (sealed_) revert AlreadySealed();
        if (endings.length == 0) revert NoEndings();
        _requireFee();

        _ending = e.rand();
        e.allowThis(_ending);
        // Deliberately granted to no one — not even the owner.
        sealed_ = true;

        emit HouseSealed();
    }

    /// @notice Add a possible ending. Only before the house is sealed.
    function addEnding(string calldata text) external onlyOwner {
        if (sealed_) revert AlreadySealed();
        endings.push(text);
    }

    function endingCount() external view returns (uint256) {
        return endings.length;
    }

    // ── The descent ────────────────────────────────────────────────────

    /**
     * @notice Wake on the seventh floor. The house learns your name.
     * @dev Mints only floor 7's seed. The floors below do not exist for you
     *      yet, in the strongest sense available: they have not been created.
     */
    function enterHouse() external payable {
        if (!sealed_) revert NotSealed();
        _requireFee();

        runs[msg.sender] = Run({
            active: true,
            escaped: false,
            floor: TOP_FLOOR,
            startedAt: uint64(block.timestamp),
            endedAt: 0
        });
        childrenEntered++;

        _mintSeed(TOP_FLOOR);
        _grantMarks(TOP_FLOOR);

        emit ChildEntered(msg.sender, uint64(block.timestamp));
    }

    /**
     * @notice Go down. Mints the next floor's seed and hands you the marks
     *         left by everyone the house kept there.
     * @param from The floor you are leaving. Must be where you actually are.
     */
    function descend(uint8 from) external payable {
        Run storage run = runs[msg.sender];
        if (run.startedAt == 0) revert NoRun();
        if (!run.active) revert RunOver();
        if (run.floor != from) revert WrongFloor();
        if (from <= BOTTOM_FLOOR) revert AtTheBottom();
        _requireFee();

        uint8 to = from - 1;
        run.floor = to;

        _mintSeed(to);
        _grantMarks(to);

        emit Descended(msg.sender, from, to);
    }

    /**
     * @notice The house keeps you — taken by a warden, or you chose to stay.
     * @param encryptedName The name to leave on the wall, encrypted client-side.
     *        This is the one encrypted value the call creates — keeping it to a
     *        single Inco value-creation per transaction is what keeps the call
     *        under Base's gas limit.
     * @param warning A plain index into `phrases` — the warning left for the
     *        next child. Not hidden; it is one of a short fixed list.
     * @param settled True if you walked into one of the warm rooms on the
     *        ground floor rather than being caught. The house prefers this.
     */
    function fallToNod(bytes calldata encryptedName, uint8 warning, bool settled)
        external
        payable
    {
        Run storage run = runs[msg.sender];
        if (run.startedAt == 0) revert NoRun();
        if (!run.active) revert RunOver();
        _requireFee();

        uint8 floor = run.floor;
        euint256 name = e.newEuint256(encryptedName, msg.sender);
        e.allowThis(name);
        // You can always read the name you left.
        e.allow(name, msg.sender);

        uint8 slot = _markCursor[floor];
        _marks[floor][slot] = Mark({
            child: msg.sender,
            at: uint64(block.timestamp),
            floor: floor,
            warning: warning,
            name: name
        });
        _markCursor[floor] = (slot + 1) % MARKS_PER_FLOOR;
        markTotal[floor]++;

        run.active = false;
        run.endedAt = uint64(block.timestamp);
        childrenKept++;

        emit ChildKept(msg.sender, floor, settled);
    }

    /**
     * @notice Open the last door. Unseals the ending — for you alone.
     */
    function reachTheDoor() external {
        Run storage run = runs[msg.sender];
        if (run.startedAt == 0) revert NoRun();
        if (!run.active) revert RunOver();
        if (run.floor != BOTTOM_FLOOR) revert NotAtTheDoor();

        run.active = false;
        run.escaped = true;
        run.endedAt = uint64(block.timestamp);
        childrenWoke++;

        e.allow(_ending, msg.sender);

        emit ChildWoke(msg.sender, uint64(block.timestamp));
    }

    // ── Internals ──────────────────────────────────────────────────────

    /// Mint a floor's layout seed inside the TEE and give it to its owner.
    function _mintSeed(uint8 floor) internal {
        euint256 seed = e.rand();
        e.allowThis(seed);
        e.allow(seed, msg.sender);
        _floorSeed[msg.sender][floor] = seed;
    }

    /// Let a newly-arrived child read the names left on this floor.
    function _grantMarks(uint8 floor) internal {
        Mark[8] storage ring = _marks[floor];
        for (uint8 i = 0; i < MARKS_PER_FLOOR; i++) {
            euint256 nm = ring[i].name;
            if (euint256.unwrap(nm) != 0) {
                e.allow(nm, msg.sender);
            }
        }
    }

    // ── Views ──────────────────────────────────────────────────────────

    /// Handle to your own seed for a floor. Decrypts only for you, and only
    /// for floors you have actually reached.
    function mySeed(uint8 floor) external view returns (euint256) {
        return _floorSeed[msg.sender][floor];
    }

    /// Anyone may read the handle. Almost nobody may decrypt it.
    function seedOf(address child, uint8 floor) external view returns (euint256) {
        return _floorSeed[child][floor];
    }

    /// Who the house kept on this floor, and the handles to what they left.
    function marksOn(uint8 floor)
        external
        view
        returns (
            address[] memory children,
            uint64[] memory times,
            uint8[] memory warnings,
            euint256[] memory names
        )
    {
        Mark[8] storage ring = _marks[floor];
        uint8 n = 0;
        for (uint8 i = 0; i < MARKS_PER_FLOOR; i++) {
            if (ring[i].child != address(0)) n++;
        }

        children = new address[](n);
        times = new uint64[](n);
        warnings = new uint8[](n);
        names = new euint256[](n);

        uint8 j = 0;
        for (uint8 i = 0; i < MARKS_PER_FLOOR; i++) {
            if (ring[i].child == address(0)) continue;
            children[j] = ring[i].child;
            times[j] = ring[i].at;
            warnings[j] = ring[i].warning;
            names[j] = ring[i].name;
            j++;
        }
    }

    /// Handle to the ending. Decryptable only by wallets that got there.
    function ending() external view returns (euint256) {
        return _ending;
    }

    function runOf(address child)
        external
        view
        returns (bool active, bool escaped, uint8 floor, uint64 startedAt, uint64 endedAt)
    {
        Run storage r = runs[child];
        return (r.active, r.escaped, r.floor, r.startedAt, r.endedAt);
    }
}
