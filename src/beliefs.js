/**
 * beliefs.js — the agent's model of the world (the B in BDI).
 *
 * Beliefs are built from SENSING and kept up to date with BELIEF REVISION:
 *   - we remember parcels we saw even after they leave our sensing range,
 *   - we forget them when the evidence says they're gone (picked up, expired,
 *     or we're looking right at the empty tile),
 *   - parcel rewards decay over time, so we track WHEN we last saw each one and
 *     estimate its value locally.
 *
 * This module holds no strategy and does no planning — it only answers the
 * question "what do I currently believe is true?".
 */

export class Beliefs {
  constructor() {
    /** @type {{id?:string,name?:string,x:number,y:number,score:number}} */
    this.me = { x: 0, y: 0, score: 0 };

    /** @type {Map<string, {id:string,x:number,y:number,carriedBy:?string,reward:number,seenAt:number}>} */
    this.parcels = new Map();

    /** @type {Map<string, {id:string,x:number,y:number,seenAt:number}>} */
    this.agents = new Map();

    /** @type {Map<string, {id:string,reward:number,seenAt:number}>} parcels I am carrying */
    this.carrying = new Map();

    /** ms it takes a parcel to lose 1 reward point, or null for no decay */
    this.decayMs = null;

    /** observation distance from server config, used to decide "should I be able to see this?" */
    this.observationDistance = 5;
  }

  /** Update my own position/score from a sensed self object or a move result. */
  updateMe(self) {
    if (!self) return;
    if (self.id !== undefined) this.me.id = self.id;
    if (self.name !== undefined) this.me.name = self.name;
    if (typeof self.x === 'number') this.me.x = self.x;
    if (typeof self.y === 'number') this.me.y = self.y;
    if (typeof self.score === 'number') this.me.score = self.score;
  }

  /** My integer tile (position is fractional mid-move; round for planning). */
  get myTile() {
    return { x: Math.round(this.me.x), y: Math.round(this.me.y) };
  }

  /** Am I standing still on a whole tile (not mid-move)? */
  get isSettled() {
    return Number.isInteger(this.me.x) && Number.isInteger(this.me.y);
  }

  /**
   * Ingest one sensing snapshot: refresh parcels and agents, and run revision.
   * @param {{self?:object, parcels?:any[], agents?:any[]}} sensing
   */
  applySensing(sensing) {
    const now = Date.now();
    if (sensing.self) this.updateMe(sensing.self);

    // --- Parcels -----------------------------------------------------------
    const sensedIds = new Set();
    for (const p of sensing.parcels || []) {
      sensedIds.add(p.id);

      if (p.carriedBy && p.carriedBy === this.me.id) {
        // It's one of mine. Keep it in `carrying`, not in the free-parcel map.
        this.carrying.set(p.id, { id: p.id, reward: p.reward, seenAt: now });
        this.parcels.delete(p.id);
        continue;
      }
      if (p.carriedBy) {
        // Carried by someone else => not available to me. Drop from options.
        this.parcels.delete(p.id);
        continue;
      }
      // A free parcel on the ground: (re)remember it with a fresh timestamp.
      this.parcels.set(p.id, {
        id: p.id, x: p.x, y: p.y, carriedBy: null, reward: p.reward, seenAt: now,
      });
    }

    // Revision: forget parcels I believe I'm carrying but no longer sense.
    // A carried parcel is always on my own tile, so it is always sensed; if it
    // is missing, it expired (or was delivered). Only revise on a real list.
    if (Array.isArray(sensing.parcels)) {
      for (const id of this.carrying.keys()) {
        if (!sensedIds.has(id)) this.carrying.delete(id);
      }
    }

    // Revision: forget remembered parcels we SHOULD have sensed but didn't.
    // If a parcel's tile is within our observation range and it wasn't in this
    // snapshot, it's gone (picked up or expired).
    for (const [id, parcel] of this.parcels) {
      if (sensedIds.has(id)) continue;
      if (this._withinObservation(parcel.x, parcel.y)) {
        this.parcels.delete(id);
      }
    }

    // Revision: forget parcels whose estimated reward has decayed to zero.
    for (const [id, parcel] of this.parcels) {
      if (this.rewardNow(parcel) <= 0) this.parcels.delete(id);
    }

    // --- Agents ------------------------------------------------------------
    for (const a of sensing.agents || []) {
      // Skip agents with unknown or fractional coordinates: a fractional
      // position means the agent is mid-move between tiles, so we can't treat
      // either tile as reliably occupied.
      if (typeof a.x !== 'number' || typeof a.y !== 'number') continue;
      if (!Number.isInteger(a.x) || !Number.isInteger(a.y)) continue;
      this.agents.set(a.id, { id: a.id, x: a.x, y: a.y, seenAt: now });
    }
    // Age out stale agent sightings (haven't seen them for a while => forget).
    for (const [id, a] of this.agents) {
      if (now - a.seenAt > 5000) this.agents.delete(id);
    }
  }

  /** Is tile (x,y) close enough that I should currently be able to see it? */
  _withinObservation(x, y) {
    const me = this.myTile;
    return Math.abs(me.x - x) + Math.abs(me.y - y) <= this.observationDistance;
  }

  /**
   * Estimated current reward of a parcel, accounting for decay since we saw it.
   * @param {{reward:number,seenAt:number}} parcel
   */
  rewardNow(parcel) {
    if (this.decayMs === null) return parcel.reward;
    const lost = Math.floor((Date.now() - parcel.seenAt) / this.decayMs);
    return parcel.reward - lost;
  }

  /** Free parcels I could go and pick up, each with its decayed reward. */
  availableParcels() {
    const out = [];
    for (const p of this.parcels.values()) {
      const r = this.rewardNow(p);
      if (r > 0) out.push({ ...p, reward: r });
    }
    return out;
  }

  /** Total decayed value of everything I'm carrying right now. */
  carriedValue() {
    let total = 0;
    for (const c of this.carrying.values()) {
      if (this.decayMs === null) total += c.reward;
      else total += Math.max(0, c.reward - Math.floor((Date.now() - c.seenAt) / this.decayMs));
    }
    return total;
  }

  /** Set of "x,y" tiles currently occupied by other agents (to route around). */
  occupiedTiles() {
    const set = new Set();
    for (const a of this.agents.values()) set.add(`${a.x},${a.y}`);
    return set;
  }

  /** Record a successful pickup (authoritative list of parcels now carried). */
  onPickedUp(pickedParcels) {
    const now = Date.now();
    for (const p of pickedParcels || []) {
      // The pickup ack may only carry {id}; recover the reward from beliefs.
      const known = this.parcels.get(p.id);
      const reward = p.reward ?? known?.reward ?? 0;
      this.carrying.set(p.id, { id: p.id, reward, seenAt: now });
      this.parcels.delete(p.id);
    }
  }

  /** Record a successful putdown (parcels delivered => no longer carried). */
  onPutDown(droppedParcels) {
    // emitPutdown() without arguments drops EVERYTHING I carry, so afterwards
    // I carry nothing — whatever the server's reply says.
    this.carrying.clear();
  }
}
