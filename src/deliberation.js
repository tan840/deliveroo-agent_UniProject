/**
 * deliberation.js — OPTIONS + FILTER (the D in BDI: generating and scoring
 * desires, then picking one to commit to as an intention).
 *
 * Each tick we ask: given what I believe right now, what could I do, and which
 * is best? Three kinds of option exist:
 *   - pickup(parcel): go grab a specific free parcel
 *   - deliver:        carry what I hold to the nearest delivery tile
 *   - explore:        wander to discover new parcels (the fallback)
 *
 * "Best" = highest score, where score trades reward against walking distance:
 *     pickup score  = decayedReward(parcel) - STEP_COST * stepsToParcel
 *     deliver score = carriedValue + DELIVER_BONUS*count - STEP_COST*stepsToDrop
 *     explore score = EXPLORE_SCORE (a low constant)
 *
 * The scores are deliberately simple and all in the same unit (reward points)
 * so they are directly comparable. Tune the weights in config.js.
 */

import { TUNABLES } from './config.js';

/**
 * Generate and score every option available right now.
 * @param {import('./beliefs.js').Beliefs} beliefs
 * @param {import('./grid.js').Grid} grid
 * @param {number} stepCost reward lost per step (from config.deriveStepCost)
 * @returns {Array<{type:string, score:number, parcel?:object, target?:{x:number,y:number}}>}
 */
export function generateOptions(beliefs, grid, stepCost) {
  const options = [];
  const me = beliefs.myTile;
  const blocked = beliefs.occupiedTiles();

  // --- pickup options ----------------------------------------------------
  for (const parcel of beliefs.availableParcels()) {
    const steps = grid.distanceTo(me, parcel, blocked);
    if (steps === Infinity) continue; // can't reach it (walls / one-way tiles)
    const score = parcel.reward - stepCost * steps;
    options.push({ type: 'pickup', parcel, target: { x: parcel.x, y: parcel.y }, score });
  }

  // --- deliver option ----------------------------------------------------
  const carriedCount = beliefs.carrying.size;
  if (carriedCount > 0) {
    const path = grid.pathToNearestDelivery(me, blocked);
    if (path !== null) {
      const steps = path.length;
      const target = steps === 0 ? me : path[path.length - 1];
      const score =
        beliefs.carriedValue() +
        TUNABLES.DELIVER_BONUS_PER_PARCEL * carriedCount -
        stepCost * steps;
      options.push({ type: 'deliver', target, score });
    }
  }

  // --- explore option (always available, low baseline) -------------------
  options.push({ type: 'explore', score: TUNABLES.EXPLORE_SCORE });

  return options;
}

/** Pick the single highest-scoring option. */
export function chooseBest(options) {
  let best = null;
  for (const o of options) {
    if (best === null || o.score > best.score) best = o;
  }
  return best;
}

/**
 * Do two options refer to the same concrete target? Used to decide whether a
 * newly-best option is genuinely different from what we're already doing.
 */
export function sameTarget(a, b) {
  if (!a || !b) return false;
  if (a.type !== b.type) return false;
  if (a.type === 'pickup') return a.parcel?.id === b.parcel?.id;
  if (a.type === 'deliver') return true; // "deliver" is one intention
  if (a.type === 'explore') return true;
  return false;
}
