/**
 * grid.js — the map, and pathfinding over it.
 *
 * This is the PLAN half of the pipeline's foundation: given where I am and
 * where I want to be, it returns the list of moves to get there.
 *
 * The important subtlety for the MEDIUM scenario is one-way tiles. The map can
 * contain arrow tiles ( ← ↑ → ↓ ). Per the challenge rules, an arrow tile
 * "cannot be entered from the neighbour indicated by the arrow" — i.e. you may
 * not enter it moving in the direction OPPOSITE to the arrow. So an ↑ tile
 * cannot be entered by moving DOWN into it (you can't come from the tile above).
 *
 * That makes the map a DIRECTED graph: an edge A -> B can exist while B -> A
 * does not. A naive undirected BFS would happily plan a path the server then
 * refuses to walk, and the agent would get stuck. The BFS below respects the
 * arrow constraint on every destination tile.
 */

/**
 * Coordinate convention (from the Deliveroo.js slides):
 *   right: x+1,  left: x-1,  up: y+1,  down: y-1
 * so "up" INCREASES y. Keep that straight or every path is upside-down.
 */
const DIRECTIONS = [
  { dir: 'right', dx: +1, dy: 0 },
  { dir: 'left', dx: -1, dy: 0 },
  { dir: 'up', dx: 0, dy: +1 },
  { dir: 'down', dx: 0, dy: -1 },
];

// Each arrow tile can ONLY be entered by moving in the arrow's own direction.
const ARROW_DIR = { '↑': 'up', '↓': 'down', '→': 'right', '←': 'left' };

const key = (x, y) => `${x},${y}`;

export class Grid {
  constructor() {
    /** @type {Map<string,string>} "x,y" -> tile type */
    this.tiles = new Map();
    this.width = 0;
    this.height = 0;
    /** @type {{x:number,y:number}[]} delivery tiles, cached for speed */
    this.deliveries = [];
    /** @type {{x:number,y:number}[]} spawner tiles, used as explore targets */
    this.spawners = [];
  }

  /**
   * Build the grid from the server's map event.
   * @param {number} width
   * @param {number} height
   * @param {Array<{x:number,y:number,type?:string,delivery?:boolean}>} tiles
   */
  loadMap(width, height, tiles) {
    this.width = width;
    this.height = height;
    this.tiles.clear();
    this.deliveries = [];
    this.spawners = [];
    for (const t of tiles || []) {
      // Normalise: prefer an explicit type; fall back to the older boolean flag.
      let type = t.type;
      if (type === undefined) type = t.delivery ? '2' : '3';
      type = String(type);
      this.tiles.set(key(t.x, t.y), type);
      if (this.isDeliveryType(type)) this.deliveries.push({ x: t.x, y: t.y });
      if (type === '1') this.spawners.push({ x: t.x, y: t.y });
    }
  }

  isDeliveryType(type) {
    return type === '2' || type === '9'; // '9' = double delivery
  }

  typeAt(x, y) {
    return this.tiles.get(key(x, y));
  }

  /**
   * A tile is walkable if it exists and is not a wall ('0'). Arrow tiles and
   * delivery/spawn/base tiles are all walkable; the direction constraint is
   * applied separately in canEnter().
   */
  isWalkable(x, y) {
    const type = this.tiles.get(key(x, y));
    return type !== undefined && type !== '0';
  }

  isDelivery(x, y) {
    const type = this.tiles.get(key(x, y));
    return type !== undefined && this.isDeliveryType(type);
  }

  /**
   * May I step onto (x,y) while moving in `dir`?  Checks walkability and the
   * one-way arrow rule on the DESTINATION tile.
   */
  canEnter(x, y, dir) {
    const type = this.tiles.get(key(x, y));
    if (type === undefined || type === '0') return false;
    const required = ARROW_DIR[type];
    return required === undefined || required === dir;
  }

  /**
   * Breadth-first search from `start` to the first tile satisfying `isGoal`.
   * Returns the path as a list of steps { x, y, dir } where `dir` is the move
   * that arrives on that tile; the start tile is NOT included. Returns null if
   * no path exists.
   *
   * @param {{x:number,y:number}} start
   * @param {(x:number,y:number)=>boolean} isGoal
   * @param {Set<string>} [blocked] tiles to avoid (e.g. other agents right now).
   *        These are treated as temporarily impassable. The start/goal are
   *        never blocked by this set.
   */
  bfs(start, isGoal, blocked = new Set()) {
    const sx = Math.round(start.x);
    const sy = Math.round(start.y);
    if (isGoal(sx, sy)) return []; // already there

    const visited = new Set([key(sx, sy)]);
    /** @type {Array<{x:number,y:number,path:{x:number,y:number,dir:string}[]}>} */
    const queue = [{ x: sx, y: sy, path: [] }];

    while (queue.length > 0) {
      const node = queue.shift();
      if (!node) break; // can't happen (length > 0), but tells the type checker node is defined
      for (const { dir, dx, dy } of DIRECTIONS) {
        const nx = node.x + dx;
        const ny = node.y + dy;
        const k = key(nx, ny);
        if (visited.has(k)) continue;
        if (!this.canEnter(nx, ny, dir)) continue;

        const goal = isGoal(nx, ny);
        // A blocked tile may be passed through only if it is the goal itself
        // (e.g. we must reach a parcel another agent happens to be standing on).
        if (blocked.has(k) && !goal) {
          continue;
        }

        const path = [...node.path, { x: nx, y: ny, dir }];
        if (goal) return path;
        visited.add(k);
        queue.push({ x: nx, y: ny, path });
      }
    }
    return null; // unreachable
  }

  /** Path to one exact tile. */
  pathTo(start, target, blocked) {
    return this.bfs(start, (x, y) => x === target.x && y === target.y, blocked);
  }

  /** Path to the nearest delivery tile (null if none reachable). */
  pathToNearestDelivery(start, blocked) {
    if (this.deliveries.length === 0) return null;
    return this.bfs(start, (x, y) => this.isDelivery(x, y), blocked);
  }

  /** Number of steps to a tile, or Infinity if unreachable. */
  distanceTo(start, target, blocked) {
    const p = this.pathTo(start, target, blocked);
    return p === null ? Infinity : p.length;
  }

  get ready() {
    return this.tiles.size > 0;
  }
}
