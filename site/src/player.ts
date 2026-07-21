/* LocalPlayer: estado e interpolação do avatar local no cliente 2D (tile + posição visual). */
import type { Position, World } from '../../engine/types';

export class LocalPlayer {
  // Tile coordinates
  x: number = 30;
  y: number = 30;

  // Visual/interpolation state
  visualX: number = 30;
  visualY: number = 30;

  // Path to follow
  path: Position[] = [];

  // Movement speed in tiles per second
  speed: number = 5.0; // 5 tiles per second

  // Username
  username: string = 'Você';

  constructor(startX: number = 30, startY: number = 30) {
    this.x = startX;
    this.y = startY;
    this.visualX = startX;
    this.visualY = startY;

    // Load username from localStorage if present
    const saved = localStorage.getItem('nos_username');
    if (saved) {
      this.username = saved;
    }
  }

  setUsername(name: string): void {
    this.username = name;
    localStorage.setItem('nos_username', name);
  }

  update(deltaTimeSeconds: number, world: World): void {
    const dist = Math.hypot(this.x - this.visualX, this.y - this.visualY);

    if (dist < 0.01) {
      this.visualX = this.x;
      this.visualY = this.y;

      if (this.path.length > 0) {
        const next = this.path.shift();
        if (next && this.isWalkable(next.x, next.y, world)) {
          this.x = next.x;
          this.y = next.y;
        } else {
          this.path = []; // stop if path blocked
        }
      }
    } else {
      const step = this.speed * deltaTimeSeconds;
      const dx = this.x - this.visualX;
      const dy = this.y - this.visualY;
      const stepDist = Math.hypot(dx, dy);

      if (stepDist <= step) {
        this.visualX = this.x;
        this.visualY = this.y;
      } else {
        this.visualX += (dx / stepDist) * step;
        this.visualY += (dy / stepDist) * step;
      }
    }
  }

  isWalkable(x: number, y: number, world: World): boolean {
    if (x < 0 || x >= world.width || y < 0 || y >= world.height) return false;
    const tile = world.tiles[y * world.width + x];
    if (!tile) return false;
    return tile.biome !== 'water';
  }

  moveDir(dx: number, dy: number, world: World): void {
    // Clear path since keyboard overrides pathfinding
    this.path = [];

    // Can only request new move if we are close to current target
    if (Math.hypot(this.x - this.visualX, this.y - this.visualY) > 0.05) return;

    const targetX = this.x + dx;
    const targetY = this.y + dy;
    if (this.isWalkable(targetX, targetY, world)) {
      this.x = targetX;
      this.y = targetY;
    }
  }

  findPathTo(targetX: number, targetY: number, world: World): void {
    if (!this.isWalkable(targetX, targetY, world)) return;

    // BFS to find shortest path
    const queue: Position[] = [{ x: this.x, y: this.y }];
    const cameFrom = new Map<string, string>();
    const key = (pos: Position) => `${pos.x},${pos.y}`;
    cameFrom.set(key(queue[0]!), '');

    let found = false;
    while (queue.length > 0) {
      const curr = queue.shift()!;
      if (curr.x === targetX && curr.y === targetY) {
        found = true;
        break;
      }

      const dirs = [
        { x: 0, y: -1 },
        { x: 0, y: 1 },
        { x: -1, y: 0 },
        { x: 1, y: 0 },
      ];

      for (const d of dirs) {
        const next = { x: curr.x + d.x, y: curr.y + d.y };
        const nextKey = key(next);
        if (this.isWalkable(next.x, next.y, world) && !cameFrom.has(nextKey)) {
          cameFrom.set(nextKey, key(curr));
          queue.push(next);
        }
      }
    }

    if (found) {
      const path: Position[] = [];
      let currKey = `${targetX},${targetY}`;
      const startKey = `${this.x},${this.y}`;
      while (currKey !== startKey) {
        const [xs, ys] = currKey.split(',');
        path.push({ x: parseInt(xs!), y: parseInt(ys!) });
        currKey = cameFrom.get(currKey) || '';
      }
      path.reverse();
      this.path = path;
    }
  }
}
