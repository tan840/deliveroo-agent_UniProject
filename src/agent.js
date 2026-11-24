/**
 * agent.js — the control loop that wires everything together.
 *
 * This is the full BDI cycle from the roadmap:
 *
 *   sensing ──▶ BELIEFS ──▶ OPTIONS ──▶ FILTER ──▶ INTENTION ──▶ PLAN ──▶ ACT
 *      ▲                                                                   │
 *      └───────────────────────────────────────────────────────────────◀─┘
 *
 * Sensing is event-driven (it keeps Beliefs fresh in the background). The loop
 * below repeatedly deliberates to pick the best option, commits to it as the
 * current intention, and executes its plan — but it keeps re-checking whether a
 * clearly better option has appeared, and abandons the current plan if so
 * (intention revision). A hysteresis margin stops it from flip-flopping.
 */

import { Beliefs } from './beliefs.js';
import { Grid } from './grid.js';
import { generateOptions, chooseBest, sameTarget } from './deliberation.js';
import {
  TUNABLES, parseDecayMs, moveDuration, deriveStepCost,
} from './config.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const withTimeout = (promise, ms) =>
  Promise.race([promise, new Promise((res) => setTimeout(() => res(undefined), ms))]);

export class Agent {
  /** @param {import('@unitn-asa/deliveroo-js-sdk/client').DjsClientSocket} socket */
  constructor(socket) {
    this.socket = socket;
    this.beliefs = new Beliefs();
    this.grid = new Grid();
    this.config = {};
    this.stepCost = TUNABLES.STEP_COST_NO_DECAY;
    this.moveDur = TUNABLES.DEFAULT_MOVE_DURATION;
    /** the option we're currently committed to (for logging/revision) */
    this.current = null;
  }

  /** Subscribe to events and wait for the essentials (map, config, identity). */
  async init() {
    const { socket, beliefs, grid } = this;

    // Keep beliefs live. These fire continuously for the whole game.
    socket.onSensing((sensing) => beliefs.applySensing(sensing));
    socket.onMap((w, h, tiles) => grid.loadMap(w, h, tiles));
    socket.onConfig((config) => this._applyConfig(config));

    // The SDK exposes promises that resolve on the first matching event.
    const map = await socket.map; // required — we can't plan without it
    grid.loadMap(map.width, map.height, map.tiles);

    const config = await withTimeout(socket.config, 3000);
    if (config) this._applyConfig(config);

    const me = await withTimeout(socket.me, 3000);
    if (me) beliefs.updateMe(me);

    console.log(
      `Map ${grid.width}x${grid.height}, ${grid.deliveries.length} delivery tiles, ` +
      `stepCost=${this.stepCost.toFixed(2)}, moveDur=${this.moveDur}ms`
    );
  }

  _applyConfig(config) {
    this.config = config;
    this.beliefs.decayMs = parseDecayMs(config);
    this.beliefs.observationDistance =
      config?.GAME?.player?.observation_distance ?? this.beliefs.observationDistance;
    this.stepCost = deriveStepCost(config);
    this.moveDur = moveDuration(config);
  }

  // ──────────────────────────────────────────────────────────────────────
  // Deliberation helpers
  // ──────────────────────────────────────────────────────────────────────

  _bestOption() {
    const options = generateOptions(this.beliefs, this.grid, this.stepCost);
    return { best: chooseBest(options), options };
  }

  /**
   * Returns true if we should drop the committed intention, because either the
   * committed option no longer exists, or another option now beats it by more
   * than the switch margin. This is the anti-oscillation gate.
   * @param {object} committed
   */
  _shouldAbort(committed) {
    const { best, options } = this._bestOption();
    if (!best) return false;
    let liveScore = -Infinity;
    for (const o of options) {
      if (sameTarget(o, committed)) { liveScore = o.score; break; }
    }
    if (liveScore === -Infinity) return true;          // target vanished
    if (sameTarget(best, committed)) return false;      // still the best plan
    return best.score > liveScore + TUNABLES.SWITCH_MARGIN;
  }

  // ──────────────────────────────────────────────────────────────────────
  // The main loop
  // ──────────────────────────────────────────────────────────────────────

  async run() {
    await this.init();
    while (true) {
      // Act only from a whole tile; mid-move positions are fractional.
      if (!this.grid.ready || !this.beliefs.isSettled) { await sleep(20); continue; }

      const { best } = this._bestOption();
      this.current = best;
      await this._execute(best);
      await sleep(10); // let queued sensing events flush between intentions
    }
  }

  /** Execute the plan for one committed intention. */
  async _execute(option) {
    switch (option.type) {
      case 'pickup': return this._doPickup(option);
      case 'deliver': return this._doDeliver(option);
      default: return this._doExplore(option);
    }
  }

  async _doPickup(option) {
    const id = option.parcel.id;
    // Target follows the parcel's believed position; returns null if it's gone.
    const targetGetter = () => {
      const p = this.beliefs.parcels.get(id);
      return p ? { x: p.x, y: p.y } : null;
    };
    const result = await this._goTo(targetGetter, () => this._shouldAbort(option));
    if (result === 'arrived') {
      const picked = await this.socket.emitPickup();
      this.beliefs.onPickedUp(picked);
      console.log(`picked up ${Array.isArray(picked) ? picked.length : '?'} parcel(s)`);
    }
    return result;
  }

  async _doDeliver(option) {
    // Fix the delivery target once (don't let it hop between equal tiles).
    const target = option.target;
    const result = await this._goTo(() => target, () => this._shouldAbort(option));
    if (result === 'arrived') {
      const dropped = await this.socket.emitPutdown();
      this.beliefs.onPutDown(dropped);
      console.log(`delivered ${Array.isArray(dropped) ? dropped.length : '?'} parcel(s), score=${this.beliefs.me.score}`);
    }
    return result;
  }

  async _doExplore() {
    const target = this._chooseExploreTarget();
    if (!target) { await sleep(this.moveDur); return 'gone'; }
    // Abort exploring the moment a worthwhile pickup/deliver appears.
    const exploreOption = { type: 'explore', score: TUNABLES.EXPLORE_SCORE };
    return this._goTo(() => target, () => this._shouldAbort(exploreOption));
  }

  /**
   * Walk to a target tile, replanning every step so we adapt to moving agents
   * and the one-way map. Returns one of:
   *   'arrived'      reached the target
   *   'unreachable'  no path exists at all
   *   'gone'         the target disappeared (targetGetter returned null)
   *   'aborted'      a better intention appeared
   *   'failed'       too many consecutive move failures
   *
   * @param {() => ({x:number,y:number}|null)} targetGetter
   * @param {() => boolean} shouldAbort
   */
  async _goTo(targetGetter, shouldAbort) {
    let failures = 0;
    while (true) {
      if (shouldAbort()) return 'aborted';
      if (!this.beliefs.isSettled) { await sleep(20); continue; }

      const me = this.beliefs.myTile;
      const target = targetGetter();
      if (!target) return 'gone';
      if (me.x === target.x && me.y === target.y) return 'arrived';

      const blocked = this.beliefs.occupiedTiles();
      let path = this.grid.pathTo(me, target, blocked);
      if (!path) {
        // No route avoiding agents. Does one exist if we ignore them? If yes,
        // an agent is blocking the only corridor — wait for it to move. If no,
        // the target is genuinely unreachable (walls / one-way tiles).
        const ignoringAgents = this.grid.pathTo(me, target, new Set());
        if (!ignoringAgents) return 'unreachable';
        await sleep(this.moveDur);
        continue;
      }
      if (path.length === 0) return 'arrived';

      const step = path[0];
      if (blocked.has(`${step.x},${step.y}`)) {
        // Next tile is occupied right now; pause and re-plan.
        await sleep(this.moveDur);
        continue;
      }

      const res = await this.socket.emitMove(step.dir);
      if (res && typeof res.x === 'number') {
        this.beliefs.updateMe(res); // authoritative integer position
        failures = 0;
      } else {
        failures++;
        if (failures > TUNABLES.MAX_MOVE_RETRIES) return 'failed';
        await sleep(this.moveDur / 2);
      }
    }
  }

  /**
   * Pick somewhere to wander to in search of parcels. Prefers parcel-spawner
   * tiles (that's where parcels appear), falling back to any reachable tile.
   * Samples a handful of random candidates and returns the first reachable one.
   */
  _chooseExploreTarget() {
    const me = this.beliefs.myTile;
    const blocked = this.beliefs.occupiedTiles();
    const pool = this.grid.spawners.length
      ? this.grid.spawners
      : [...this.grid.tiles.keys()].map((k) => {
          const [x, y] = k.split(',').map(Number);
          return { x, y };
        });
    if (pool.length === 0) return null;

    for (let i = 0; i < 20; i++) {
      const c = pool[Math.floor(Math.random() * pool.length)];
      if (c.x === me.x && c.y === me.y) continue;
      if (this.grid.distanceTo(me, c, blocked) !== Infinity) return c;
    }
    return null;
  }
}
