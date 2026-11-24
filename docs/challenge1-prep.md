# Challenge 1 Prep — November 26, 2026

Source: `ON_THE_CHALLENGE.pdf`. This is the **first tournament**, not the graded
submission. Captured 2026-11-13.

## What it actually is
- **One agent per team at a time**, run from your own machine, connected to
  `https://deliveroojs.bears.disi.unitn.it` (fallback `https://deliveroojs.rtibdi.disi.unitn.it`).
- **Not mandatory, not graded** — "no matter the performance." Goal is to test
  and improve your agent in a crowded multi-agent map. A dry run for the real
  submission.
- Each scenario runs **3–5 minutes with all teams at once**; you're scored by
  finishing position per match.
- Repos: `github.com/unitn-ASA/DeliverooAgent.js`, `github.com/unitn-ASA/Deliveroo.js`.

## Scenarios (only the first two matter on the 26th)
1. **Simple** — infinite capacity (-1). Tiles: 0 wall, 1 spawner, 2 delivery, 3 walkable.
2. **Medium** — infinite capacity **+ one-way arrow tiles** (↑ ↓ ← →): cannot be
   entered against the arrow. **This is the thing to get right.**
3. **Extreme** — finite capacity + pushable crates. **Explicitly NOT the focus** of this challenge.

## Target for the 26th
A rock-solid **single BDI agent** that:
1. connects to the remote server,
2. survives Medium's one-way tiles (directed pathfinding — not undirected),
3. runs 3–5 min in a crowded map without crashing or getting stuck.

PDDL planner, LLM agent, and coordination come **after**, for the graded submission.

## Logistics checklist (do before the 26th)
- [ ] **Enroll**: fill the form `https://forms.gle/SES4mZjSyXtpuLYM8`.
- [ ] **Install the unitn VPN** (GlobalProtect, via ServiceDesk) — required to
      reach the `bears.disi.unitn.it` server.
- [ ] **Test the connection**: open `https://deliveroojs.bears.disi.unitn.it`
      in a browser on the VPN, generate a token, confirm it loads.
- [ ] Put that HOST + TOKEN in the agent's `.env`, run `npm start`, confirm it
      connects and plays on the remote server (not just localhost).
- [ ] Watch it for 5 min on a Medium-style map locally first (one-way tiles)
      to confirm it doesn't get stuck.

## Remaining open items (for the full project, from the roadmap)
- PDDL lab (lab5) material, LLM server access + tool catalog, messaging API (lab6).
- Exact dates: Challenge 2, submission deadline, oral exam.
