# ASA Project Roadmap: 12–30 November 2026

Goal: a working Deliveroo.js submission (JavaScript code, report of max 10 pages, oral presentation) built by someone new to JS in 19 days.

NOTE: Challenge 1 (Nov 26) is a single-agent tournament, Simple + Medium scenarios only — see docs/challenge1-prep.md. The agent in this repo targets that. PDDL / LLM / coordination below are for the graded submission.

## What the course requires

**Part 1 (Challenge 1): BDI agent**
- Beliefs built from sensing, with belief revision
- Intentions that are activated and revised
- Predefined plans from a plan library
- Automated planning: once an intention is active, the agent calls an external planner (PDDL) to get the plan

**Part 2 (Challenge 2): LLM agent**
- A second agent with LLM memory, LLM planner and LLM replanner
- Reads objectives in natural language, uses tools from the course's tool server
- The two agents exchange beliefs and coordinate (e.g. the closest one commits to a parcel)

**Delivery**
- JS code + final report (max 10 pages) + oral presentation
- Submission is due at least 1 week before the exam

## The agent pipeline

```
Game server (Socket.IO)
   | sensing events: me, map, parcels, agents
   v
BELIEFS     Map of parcels / agents / tiles, with timestamps and revision
   v
OPTIONS     every possible goal right now: pick up P1, deliver, explore
   v
FILTER      score each option (reward - distance cost) -> best one
   v
INTENTION   commit to it; drop it if a clearly better one appears
   v
PLAN        plan library (BFS path) or PDDL planner -> list of actions
   v
ACT         emitMove / emitPickup / emitPutdown, check result, replan on failure
   |__________________> loop back to sensing
```

## Schedule (original)

| Dates | Phase | Build |
|---|---|---|
| Thu 12 - Fri 13 | 0. Setup + JS survival kit | Node, repos, server, token, demo agent |
| Sat 14 - Sun 15 | 1. Beliefs + reactive agent | belief store; revision; blind_pick |
| Mon 16 - Thu 19 | 2. BDI loop | options, scoring, intentions, BFS, revision |
| Fri 20 - Sun 22 | 3. PDDL planner | domain, problem from beliefs, planner call, BFS fallback |
| Mon 23 - Thu 26 | 4. LLM agent | LLM memory, tool-calling loop, replanning |
| Fri 27 - Sat 28 | 5. Communication | message protocol, shared beliefs, closest-commits |
| Sun 29 - Mon 30 | 6. Report + presentation | 10-page report, slides, demo, rehearsal |

## Report outline (10 pages max)
1. Problem and architecture overview (1 page, include the pipeline diagram)
2. Beliefs and belief revision (1.5)
3. Deliberation: options, scoring, intention revision (2)
4. Planning: plan library and PDDL (1.5)
5. LLM agent: memory, planner, replanner, tools (2)
6. Communication and coordination (1)
7. Results from test runs and known limits (1)

## If behind, cut in this order
1. Coordination -> only share parcel beliefs, skip negotiation
2. LLM agent -> single loop, no reflection
3. PDDL -> use it only for path planning to a single target
Never cut: a stable BDI agent, and the report.

## Open items
- PDDL lab (lab5), LLM server access + tool catalog, messaging API lab (lab6)
- Exact dates: Challenge 2, submission, oral exam
