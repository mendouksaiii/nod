# NOD

**A seven-floor house. The stairs only go down. The floors below you do not exist until you earn them — and that is enforced by cryptography, not by level design.**

▶ **Play: https://nod-house.vercel.app**
📜 Contract: [`0x1761c998b09df0c21553a57f0477f082f31924fd`](https://sepolia.basescan.org/address/0x1761c998b09df0c21553a57f0477f082f31924fd) on Base Sepolia
🏆 Built for the Inco Summer Game Jam — **Inco Lightning** track

---

An eight-year-old wakes on the top floor of a house that is not his house. There is no outside; the windows show a flat grey nothing. Where the stairs going up should be, someone has boarded over the doorway — and the nails are on the inside.

Every floor is held by something that used to be a child. The house does not want to kill you. It wants you to **stop**, because stopping is how you become the next warden.

---

## Play it in thirty seconds

The title screen has two doors:

| | |
|---|---|
| **WAKE UP** | The real run. Needs a browser wallet on **Base Sepolia** and a little test ETH. Your descent is sealed on-chain and the house remembers you. |
| **WAKE UP WITHOUT BEING REMEMBERED** | No wallet, no chain, plays immediately. Everything works — the house just doesn't record you, and the floors below aren't cryptographically sealed. |

**If you are judging and don't want to fund a wallet, take the second door.** You'll see the whole game. The section below explains exactly what the first door adds, and it's all verifiable on Basescan without playing.

### Controls

`A` `D` move · `Shift` run · `C` sneak · `E` interact · `Q` throw · `F` torch

There is no HUD beyond a battery sliver. Everything else is written on the walls in a child's handwriting, because the children who came before you left instructions.

---

## How NOD uses Inco

Most on-chain games put the chain *beside* the game — a token, a leaderboard, an NFT of something you already own. Take the chain away and the game is unchanged.

**Take Inco away from NOD and the game cannot tell its own story.**

The premise makes three promises. Each is a lie unless something enforces it.

### 1. You cannot know what is below you

Every game says "you can't go back." Players datamine the client, post a map, and the mystery becomes a wiki.

Here, each floor's layout seed is an `euint256` minted by `e.rand()` inside Inco's TEE — and it is **never minted for a floor you have not reached**:

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

Access is granted in one direction only. **"The stairs only go down" is not flavour text — it is an access-control policy, and it is the same sentence.**

### 2. The children who came before you are really there

When a run ends — taken by a warden, or you accept one of the warm doorways on the ground floor and stay — the contract stores your epitaph **encrypted**:

```solidity
function fallToNod(bytes calldata encryptedPhrase, bool settled) external payable
```

The phrase is an encrypted index into a fixed on-chain list, so nobody can write anything vile on the nursery wall. Even *which* warning you left is hidden.

That epitaph becomes readable only to a player **standing on the floor where you stopped**:

```solidity
/// Let a newly-arrived child read the epitaphs left on this floor.
function _grantMarks(uint8 floor) internal {
    Mark[8] storage ring = _marks[floor];
    for (uint8 i = 0; i < MARKS_PER_FLOOR; i++) {
        euint256 ep = ring[i].epitaph;
        if (euint256.unwrap(ep) != 0) e.allow(ep, msg.sender);
    }
}
```

So the shoes in the corridor and the warnings scratched into the walls are **real players**, and the only way to read what someone left is to survive to where they died. You cannot browse it. You cannot scrape it. **The community collectively cannot spoil the house**, because the house *is* the access-control boundary.

### 3. Nobody knows how it ends

The ending is minted by `sealHouse()` and granted to no one — not a player, not the deployer. It becomes decryptable only for a wallet that has provably descended all seven floors:

```solidity
function reachTheDoor() external {
    if (run.floor != BOTTOM_FLOOR) revert NotAtTheDoor();
    run.escaped = true;
    e.allow(_ending, msg.sender);   // for you alone
}
```

I do not know what is behind that door, and the contract on Base Sepolia will back me up.

### Why this needed Inco specifically

Every one of those is **a secret with a rule attached**. Not a private key, not a hidden balance — game state that must live on a public chain, must be provably tamper-free, and must become readable to exactly one person at exactly one moment.

The old answer is a server: keep the secrets in a database and trust the developer. That works, and it also means the developer could rewrite who died where, or what is behind the door.

Inco Lightning let me keep the secrets on-chain and **program who may read them**. It isn't encryption that makes this game work — it's **programmable decryption**. `e.allow` is the load-bearing primitive; everything above is downstream of being able to say *this value exists, it is provably tamper-free, and exactly one person may read it, at exactly one moment.*

The game itself runs entirely in the browser. The chain is never in the hot path — it is touched four times per run (enter, descend, kept, door), and every one of those is hidden inside a fade to black.

---

## The house

Each floor is held by a warden that hunts by exactly **one sense**. Learning which — and what denies it — is the game.

| Floor | | Hunts by | What saves you |
|---|---|---|---|
| **7** | The Nursery | sight & motion | stillness, shadow, broken line of sight |
| **6** | The Flooded Baths | sound | move slow, dry boards, throw a decoy |
| **5** | The Pantry | smell | mask in smoke or spice, bait it away |
| **4** | The Study | echolocation | soft cover only — stillness does **not** work |
| **3** | The Corridors | vibration | get off the floorboards entirely |
| **2** | The Mirror Floor | reflection | drape every mirror |
| **1** | The Ground Floor | *nothing hunts you* | keep walking |

The fourth floor deliberately inverts what the seventh taught you. The first floor has no warden and no key — just one long room, real daylight under the door at the end, and doorways that open as you pass and offer you things. Step into one and you stay. Keep walking and nothing happens. That is the horror.

**Every warden was a child.** They are the same body bent in the direction of the fear that stopped them, each with its own colour of wrong — candle-white over grave-blue rags, drowned blue-white that never dries, raw fed pink over split skin.

They are not patrol routes. When one loses you it works out which hiding places are near where it lost you, walks to each, and **stops over it to look inside**. If you are in the one it opens, it hauls you out. The long-limbed ones will leave the floor and climb the wall to reach you.

Being caught **ends the run.** There are no checkpoints. You wake in the bed you started in with everything you were carrying gone.

---

## Sound

Almost all of it is synthesised at runtime — there are only two recorded clips in the whole game.

That is a design choice, not a shortcut. Horror sound stops working the moment you recognise a loop, and a procedural engine does things samples can't: **the boy's breathing rate is literally his fear level**, the warden is panned to where it is actually standing, and on the fourth floor the sonar ping you hear *is* the mechanic that finds you.

Under it sits a score of five detuned voices tuned to a minor second and a tritone. It never changes note, so it never becomes a tune — it only opens up as the dread rises. And it **cuts out entirely** the moment you are actually being hunted, because silence at the worst moment is a stronger cue than a swell.

The loudest thing in the mix is usually a child breathing.

---

## Running it locally

```bash
git clone https://github.com/mendouksaiii/nod && cd nod
npm install --ignore-scripts
```

> `--ignore-scripts` is needed because a transitive Solidity-source dependency has a broken postinstall on Windows. Only its `.sol` files are consumed, so skipping it is safe.

**Frontend** — `frontend/.env.local`:

```bash
NEXT_PUBLIC_NETWORK=testnet
NEXT_PUBLIC_NODHOUSE_ADDRESS=0x1761c998b09df0c21553a57f0477f082f31924fd
```

```bash
npm run dev            # http://localhost:3000
```

**Contracts** — `contracts/.env`:

```bash
PRIVATE_KEY_BASE_SEPOLIA=0x...
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
```

```bash
npm run contracts:test           # against Base Sepolia
npm run contracts:deploy:testnet
```

After deploying you must call `sealHouse()` once. It cannot happen in the constructor — encrypted operations charge the Inco executor fee and therefore need `msg.value`.

### Layout

```
contracts/contracts/NodHouse.sol   the house as a contract
frontend/game/
  build.ts       shared floor vocabulary, shared geometry + materials
  floors/        floor7 … floor1, one file each
  entity.ts      one state machine, six senses
  theo.ts        the boy: skeletal rig, hides, climbs, carries
  audio.ts       the entire soundtrack, synthesised
  chain.ts       the four calls to the house
```

---

## Honest state of things

Built solo during the jam window.

- All seven floors are playable and traversable end to end; every warden sense, the noise system and the descent chain are verified by instrumentation.
- The look is **stylised graybox** — flat volumes, one sickly accent light per floor. Read it as a lighting-and-silhouette game, because that is what it is.
- **The House Remembers is real but will look empty at first.** It is a ring of the last 8 children kept on each floor, filled by actual player deaths. Until people play, the walls are bare — the mechanism works, it just has nothing to show you yet. This is the honest cost of building the memorial out of real players instead of fake ones.

---

*there were four of us when i woke up.*
*i am writing this down so the next one knows.*
*it sees you move. it does not see you if you are still.*
*— wren*
