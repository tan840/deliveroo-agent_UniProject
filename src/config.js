/**
 * config.js — all the knobs in one place.
 *
 * Two kinds of settings live here:
 *   1. TUNABLES: numbers you change to alter the agent's "personality"
 *      (how greedy it is, when it decides to deliver, etc.). Start with these.
 *   2. Helpers that read the *server's* config object (movement speed, parcel
 *      decay) so the agent adapts to whatever map it is dropped into.
 *
 * Nothing here talks to the network. It is pure data + small pure functions,
 * which makes it the safest file to experiment in.
 */

export const TUNABLES = {

  STEP_COST_NO_DECAY: 0.6,
  
  MIN_STEP_COST: 0.1,
  
  EXPLORE_SCORE: 0.5,
  
  SWITCH_MARGIN: 1.5,
  
  MAX_MOVE_RETRIES: 3,

  DEFAULT_MOVE_DURATION: 500,
 
  EXPLORE_REPLAN_EVERY: 6,

  TARGET_LOAD: 4,

  DELIVER_URGENCY: 5,

  HOARD_PULL: 4,
  
};

/**
 * Parse the server's "parcel decaying" setting into milliseconds-per-point.
 * The server may express it as the string 'infinite' (never decays), a number
 * of milliseconds, or a short string like '1s' / '500ms' / '2000'.
 *
 * @param {any} config the IOConfig object from socket.onConfig
 * @returns {number|null} ms it takes a parcel to lose 1 reward point, or null
 *                        if parcels never decay.
 */
export function parseDecayMs(config) {
  const setting = config?.GAME?.parcels?.decaying_event;
  if (setting === undefined || setting === null || setting === 'infinite') {
    return null; // parcels keep their reward forever
  }
  if (typeof setting === 'number' && setting > 0) return setting;
  if (typeof setting === 'string') {
    const m = setting.trim().match(/^(\d+(?:\.\d+)?)\s*(ms|s)?$/i);
    if (m) {
      const n = parseFloat(m[1]);
      const unit = (m[2] || 'ms').toLowerCase();
      return unit === 's' ? n * 1000 : n;
    }
  }
  return null; 
}

/**
 * Movement duration in ms, read from server config with a sane fallback.
 * @param {any} config
 * @returns {number}
 */
export function moveDuration(config) {
  const d = config?.GAME?.player?.movement_duration;
  return typeof d === 'number' && d > 0 ? d : TUNABLES.DEFAULT_MOVE_DURATION;
}

/**
 * Carrying capacity: -1 means infinite (the case for Challenge 1 Simple/Medium).
 * @param {any} config
 * @returns {number} capacity, or Infinity when the server reports -1 / missing.
 */
export function capacity(config) {
  const c = config?.GAME?.player?.capacity;
  if (c === undefined || c === null || c === -1) return Infinity;
  return c;
}

/**
 * Reward lost per step of walking. This is the heart of the distance/greed
 * trade-off: a parcel's value when you finally reach it is roughly
 *   reward - STEP_COST * (steps to walk there).
 * @param {any} config
 * @returns {number}
 */
export function deriveStepCost(config) {
  const decayMs = parseDecayMs(config);
  if (decayMs === null) return TUNABLES.STEP_COST_NO_DECAY;
  // reward points lost per step = (ms per step) / (ms per lost point)
  const perStep = moveDuration(config) / decayMs;
  return Math.max(TUNABLES.MIN_STEP_COST, perStep);
}
