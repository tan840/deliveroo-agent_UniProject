# ASA BDI Agent — Challenge 1 (Deliveroo.js)

A single **BDI agent** for the Autonomous Software Agents course, built for the
**November 26 challenge** (the Simple and Medium scenarios). It senses parcels,
decides what's worth collecting, walks there respecting one-way tiles, and
delivers — running for several minutes in a crowded map without crashing.

It is deliberately scoped to what the challenge needs. The PDDL planner, the
LLM agent, and two-agent coordination (the rest of the course project) are
**not** here yet — see "What's intentionally left out" below.

---

## 1. Run it

```bash
npm install
cp .env.example .env        # then edit .env
npm start
```

In `.env` set:

- `HOST` — the game server.
  - Local server: `http://localhost:8080`
  - Challenge server (needs the unitn VPN): `https://deliveroojs.bears.disi.unitn.it`
- `TOKEN` — open `HOST` in a browser, pick a name, copy the token it gives you.
  Use the **same token** in the browser and in `.env` so you can watch your
  agent play from its own point of view.

Then `npm start`. You should see it connect, print the map size, and start
collecting. Open the same HOST in a browser (with the same token) to watch.

---

## 2. How the code maps to the BDI cycle

The whole agent is the loop from the course slides:

```
sensing ─▶ BELIEFS ─▶ OPTIONS ─▶ FILTER ─▶ INTENTION ─▶ PLAN ─▶ ACT ─┐
   ▲                                                                  │
   └──────────────────────────────────────────────────────────────◀──┘
```

| File | Role in the cycle | What to read it for |
|---|---|---|
| `index.js` | boot | How we connect (`DjsConnect`) and start the agent. |
| `src/config.js` | tunables | Every number that shapes behaviour, in one place. Start here when experimenting. |
| `src/beliefs.js` | **BELIEFS** | How sensing becomes a world model, incl. parcel decay and **belief revision** (forgetting parcels that are gone). |
| `src/grid.js` | **PLAN** (paths) | The map + **BFS that respects one-way tiles** (the key to the Medium scenario). |
| `src/deliberation.js` | **OPTIONS + FILTER** | How we list possible goals and score them (reward vs. distance). |
| `src/agent.js` | **INTENTION + ACT** | The control loop, intention revision (switching goals), and plan execution with collision/failure handling. |

### The one part worth really understanding: one-way tiles

In the Medium scenario the map contains arrow tiles `← ↑ → ↓`. An arrow tile
*cannot be entered moving against the arrow* — e.g. an `↑` tile cannot be
entered by moving **down** into it. That makes the map a **directed graph**: a
path A→B can be legal while B→A is not. A normal (undirected) BFS would plan
paths the server then refuses, and the agent would freeze. `grid.js` applies
the arrow rule to every candidate step (`canEnter`), so paths are always
walkable in the direction we intend to go.

### How it decides what to do

Each tick, `deliberation.js` builds one option per reachable free parcel, one
"deliver what I'm carrying" option, and a low-score "explore" fallback. Every
option is scored in the same unit (reward points):

```
pickup  = decayedReward(parcel) − stepCost × stepsToParcel
deliver = carriedValue + bonus×parcelsCarried − stepCost × stepsToDelivery
explore = a small constant
```

The highest score wins. `stepCost` is derived from the server's parcel-decay
setting, so on a fast-decaying map the agent prefers nearby parcels, and on a
no-decay map it still mildly prefers closer ones.

### Not flip-flopping (intention revision)

Once committed, the agent keeps re-checking for a better option while it walks.
It only abandons the current goal if a different one beats it by more than
`SWITCH_MARGIN` (see `config.js`), or if the current goal becomes invalid (the
parcel got taken). That hysteresis is what stops it oscillating between two
almost-equal parcels.

---

## 3. Tuning its personality

All in `src/config.js → TUNABLES`:

- `DELIVER_BONUS_PER_PARCEL` ↑ → delivers sooner (banks points, carries less).
- `STEP_COST_NO_DECAY` ↑ → greedier about distance (ignores far parcels).
- `SWITCH_MARGIN` ↑ → more stubborn (commits harder, oscillates less).
- `EXPLORE_SCORE` ↑ → wanders more readily when idle.

Change one at a time and watch the browser.

---

## 4. What's intentionally left out (and where it goes later)

This is the Challenge-1 agent. For the graded submission you'll add:

- **PDDL planner** — replace/augment `grid.js` BFS with a call to the external
  planner (course lab 5). The plan step is already isolated, so this slots in.
- **LLM agent** — a second agent (course labs on LLM memory/planning/tools).
- **Communication & coordination** — two agents sharing beliefs and splitting
  parcels (lab 6). The belief store already distinguishes "seen by me"; a
  "told by teammate" source is the natural extension.
- **Extreme scenario** — finite capacity + pushable crates. Not required for
  Nov 26; `config.capacity()` already reads the limit when you need it.

---

## 5. Troubleshooting

- **Connects but doesn't move:** check the browser shows your agent on the map,
  and that the map has delivery tiles (`type` `2`). The console prints the map
  size and delivery count on start.
- **"Connecting... " then nothing:** wrong HOST/TOKEN, or (for the unitn server)
  the VPN isn't up.
- **Gets stuck in a corner on Medium:** that's the one-way logic doing its job —
  confirm by watching; if it's genuinely wrong, the suspect is `FORBIDDEN_ENTRY`
  in `grid.js`.
