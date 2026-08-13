# How NOD uses Inco in the core gameplay loop

**Play:** https://nod-house.vercel.app
**Contract:** [`0x1761c998b09df0c21553a57f0477f082f31924fd`](https://sepolia.basescan.org/address/0x1761c998b09df0c21553a57f0477f082f31924fd) — Base Sepolia
**Track:** Inco Lightning

---

Most on-chain games put the chain *beside* the game: a token, a leaderboard, an
NFT of something you already own. Take the chain away and the game is unchanged.

**Take Inco away from NOD and the game cannot tell its own story.**

NOD is a seven-floor house. An eight-year-old wakes on the top floor, and the
stairs only go down. The premise makes three promises, and each one is a lie
unless something enforces it.

---

## 1. The floor below you does not exist until you reach it

Every game says "you can't go back." Players datamine the client, post a map,
and the mystery becomes a wiki by the second day.

In NOD, each floor's layout seed is an `euint256` minted by `e.rand()` inside
Inco's TEE — and it is **never minted for a floor you have not stood on**:

```solidity
function descend(uint8 from) external payable {
    if (run.floor != from) revert WrongFloor();   // you must actually be there
    uint8 to = from - 1;
    run.floor = to;
    _mintSeed(to);      // the floor below is created only now
    _grantMarks(to);
}

function _mintSeed(uint8 floor) internal {
    euint256 seed = e.rand();       // randomness from the TEE, no oracle
    e.allowThis(seed);
    e.allow(seed, msg.sender);      // and to exactly one person
    _floorSeed[msg.sender][floor] = seed;
}
```

This is not a flag the client checks. The value has not been created, and access
is granted in one direction only.

**"The stairs only go down" is an access-control policy and a piece of flavour
text that happen to be the same sentence.**

### It is load-bearing, not decorative

The seed is not a certificate you collect. The game **cannot build a floor until
Inco has decrypted the seed for it** — the level geometry is downstream of the
ciphertext:

```ts
const s = await this.bridge.floorSeed(n);   // handle → attested decrypt
if (s !== null) seed = Number(s % 0xffffffffn);
this.floor = buildFloor(this.scene, n, seed);
```

That number decides where the key is hidden. On the nursery it selects one of
three places — on the toy chest, along the rail of the cot, or on top of a 6.6m
stack of crates you have to climb. Each one sends you on a different route
through the floor, past a different warden, with a different amount of noise.
The encrypted value is the level, not a badge.

---

## 2. The children who came before you are really there

When a run ends — taken by a warden, or you accept one of the warm doorways on
the ground floor and stay — the contract stores your epitaph **encrypted**:

```solidity
function fallToNod(bytes calldata encryptedPhrase, bool settled) external payable
```

The phrase is an encrypted index into a fixed on-chain list, so nobody can write
anything vile on a nursery wall. Even *which* warning you left is hidden.

That epitaph becomes readable only to a player standing on the floor where you
stopped:

```solidity
/// Let a newly-arrived child read the marks left on this floor.
function _grantMarks(uint8 floor) internal {
    Mark[8] storage ring = _marks[floor];
    for (uint8 i = 0; i < MARKS_PER_FLOOR; i++) {
        euint256 ep = ring[i].epitaph;
        if (euint256.unwrap(ep) != 0) e.allow(ep, msg.sender);
    }
}
```

So the shoes in the corridor and the warnings scratched into the plaster are
**real players**, and the only way to read what someone left is to survive to
where they died. You cannot browse it. You cannot scrape it. **The community
collectively cannot spoil the house**, because the house *is* the access-control
boundary.

---

## 3. Nobody knows how it ends

The ending is minted by `sealHouse()` and granted to no one — not a player, not
the deployer. It becomes decryptable only for a wallet that has provably
descended all seven floors:

```solidity
function reachTheDoor() external {
    if (run.floor != BOTTOM_FLOOR) revert NotAtTheDoor();
    run.escaped = true;
    e.allow(_ending, msg.sender);   // for you alone
}
```

I do not know what is behind that door, and the contract on Base Sepolia will
back me up.

---

## Where it sits in the loop

The chain is touched **four times per run**, and every one is hidden inside a
fade to black. It is never in the hot path — the game runs entirely in the
browser at 60fps.

| Moment | Call | What Inco does |
|---|---|---|
| Waking | `enterHouse()` | mints the nursery's seed, granted to you alone |
| Each descent | `descend(from)` | creates the floor below **only now**, and unseals the marks on it |
| Being kept | `fallToNod(phrase, settled)` | writes your epitaph, encrypted, onto that floor's ring |
| The door | `reachTheDoor()` | grants an ending that was granted to nobody at seal time |

---

## Why this needed Inco specifically

Every one of those is **a secret with a rule attached**. Not a private key, not
a hidden balance — game state that must live on a public chain, must be provably
tamper-free, and must become readable to exactly one person at exactly one
moment.

The old answer is a server: keep the secrets in a database and trust the
developer. That works, and it also means the developer could rewrite who died
where, or what is behind the door.

Inco Lightning let me keep the secrets on-chain and **program who may read
them**. It is not encryption that makes this game work — it is **programmable
decryption**. `e.allow` is the load-bearing primitive, and everything above is
downstream of being able to say: *this value exists, it is provably tamper-free,
and exactly one person may read it, at exactly one moment.*

---

## Honest notes for judges

- **You do not need to fund a wallet to see the game.** The title screen has a
  second door — *wake up without being remembered* — that plays immediately with
  no chain at all. Everything above is verifiable on Basescan without playing.
- **A failed decrypt falls back to a local seed rather than stranding the
  player.** Deliberate: a player mid-descent should never be stopped by an RPC
  hiccup. The on-chain guarantees are unchanged; the client simply degrades.
- **The memorial is real but will look sparse.** It is a ring of the last eight
  children kept on each floor, filled by actual player deaths. Until people
  play, the walls are bare. That is the honest cost of building it out of real
  players instead of seeded fakes.
