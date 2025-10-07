import { FOOD, SNAKE, WORLD, NETWORK } from "./config.js";
import { clamp, distSq, rotateTowards } from "./math.js";
import { Food, PublicSnapshot, Snake, Vec2 } from "./types.js";
import { customAlphabet } from "nanoid";

const idGen = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 12);

function randomInRange(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function randomPoint(): Vec2 {
  return { x: randomInRange(0, WORLD.width), y: randomInRange(0, WORLD.height) };
}

export class World {
  readonly width: number;
  readonly height: number;
  private snakes: Map<string, Snake> = new Map();
  private food: Food[] = [];
  private nextFoodId = 1;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;

    for (let i = 0; i < FOOD.targetCount / 2; i++) this.spawnFood();
  }

  addSnake(name: string, color: number): Snake {
    const id = idGen();
    const start = randomPoint();
    const angle = randomInRange(-Math.PI, Math.PI);
    const segments: Vec2[] = [];
    for (let i = 0; i < SNAKE.initialSegments; i++) {
      const t = i * SNAKE.segmentSpacing;
      segments.push({
        x: clamp(start.x - Math.cos(angle) * t, 0, this.width),
        y: clamp(start.y - Math.sin(angle) * t, 0, this.height),
      });
    }

    const spawnTime = Date.now();
    const snake: Snake = {
      id,
      name,
      color,
      angle,
      desiredAngle: angle,
      boosting: false,
      speedUnitsPerSec: SNAKE.baseSpeedUnitsPerSec,
      radius: SNAKE.radius,
      segmentSpacing: SNAKE.segmentSpacing,
      targetSegments: SNAKE.initialSegments,
      segments,
      spawnTime,
    };
    this.snakes.set(id, snake);
    return snake;
  }

  removeSnake(id: string): void {
    this.snakes.delete(id);
  }

  respawnSnake(oldId: string, name: string, color: number): Snake {
    this.snakes.delete(oldId);
    const newSnake = this.addSnake(name, color);
    // Update spawn time for respawned snake
    newSnake.spawnTime = Date.now();
    return newSnake;
  }

  setSnakeInput(id: string, desiredAngle: number, boosting: boolean | undefined) {
    const s = this.snakes.get(id);
    if (!s) return;
    
    // Only apply spawn delay to bot snakes (player snakes can move immediately)
    // Bot snakes have names starting with "Bot"
    if (s.name.startsWith("Bot")) {
      const now = Date.now();
      const timeSinceSpawn = now - s.spawnTime;
      if (timeSinceSpawn < SNAKE.spawnDelayMs) {
        // Bot snake is still in spawn delay, ignore input
        return;
      }
    }
    
    s.desiredAngle = desiredAngle;
    s.boosting = Boolean(boosting);
  }

  update(dt: number): void {
    const borderDeaths: string[] = [];
    for (const s of this.snakes.values()) {
      const alive = this.updateSnake(s, dt);
      if (!alive) borderDeaths.push(s.id);
    }
    if (borderDeaths.length) this.killSnakes(borderDeaths, false); // no food on wall crash
    this.resolveCollisions();
    this.maintainFoodPopulation();
  }

  private updateSnake(s: Snake, dt: number): boolean {
    // Only apply spawn delay to bot snakes (player snakes can move immediately)
    // Bot snakes have names starting with "Bot"
    if (s.name.startsWith("Bot")) {
      const now = Date.now();
      const timeSinceSpawn = now - s.spawnTime;
      if (timeSinceSpawn < SNAKE.spawnDelayMs) {
        // Bot snake is still in spawn delay, don't move at all
        return true; // Keep snake alive but don't move
      }
    }

    const turnSpeed = SNAKE.turnSpeedRadiansPerSec * dt;
    s.angle = rotateTowards(s.angle, s.desiredAngle, turnSpeed);

    const speed = s.speedUnitsPerSec * (s.boosting ? SNAKE.boostMultiplier : 1);
    const dx = Math.cos(s.angle) * speed * dt;
    const dy = Math.sin(s.angle) * speed * dt;

    const head = s.segments[0]!;
    const nx = head.x + dx;
    const ny = head.y + dy;
    // Border death if moving outside world bounds
    if (nx < 0 || nx > this.width || ny < 0 || ny > this.height) {
      return false;
    }
    const newHead: Vec2 = { x: nx, y: ny };
    s.segments.unshift(newHead);

    // ensure spacing by removing extra tail segments until approximate spacing
    let accDist = 0;
    const filtered: Vec2[] = [s.segments[0]!];
    for (let i = 1; i < s.segments.length; i++) {
      const a = filtered[filtered.length - 1]!;
      const b = s.segments[i]!;
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      accDist += d;
      if (accDist >= s.segmentSpacing) {
        filtered.push(b);
        accDist = 0;
      }
    }
    s.segments = filtered;
    // trim to target segment count if exceeded
    if (s.segments.length > s.targetSegments) {
      s.segments.length = s.targetSegments;
    }
    return true;
  }

  private resolveCollisions() {
    // Build spatial grids for food and snake body segments
    const cellSize = 64;
    const foodGrid = new Map<string, number[]>(); // key -> indices into this.food
    const keyOf = (x: number, y: number) => `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)}`;
    for (let i = 0; i < this.food.length; i++) {
      const f = this.food[i]!;
      const k = keyOf(f.x, f.y);
      let arr = foodGrid.get(k);
      if (!arr) {
        arr = [];
        foodGrid.set(k, arr);
      }
      arr.push(i);
    }

    const consumed = new Set<number>();
    for (const s of this.snakes.values()) {
      const head = s.segments[0]!;
      const r = s.radius + FOOD.radius;
      const minCx = Math.floor((head.x - r) / cellSize);
      const maxCx = Math.floor((head.x + r) / cellSize);
      const minCy = Math.floor((head.y - r) / cellSize);
      const maxCy = Math.floor((head.y + r) / cellSize);
      for (let cx = minCx; cx <= maxCx; cx++) {
        for (let cy = minCy; cy <= maxCy; cy++) {
          const k = `${cx},${cy}`;
          const indices = foodGrid.get(k);
          if (!indices) continue;
          for (const idx of indices) {
            if (consumed.has(idx)) continue;
            const f = this.food[idx]!;
            const rr = s.radius + f.radius;
            if (distSq(head.x, head.y, f.x, f.y) <= rr * rr) {
              consumed.add(idx);
              // Increase target length by 1 per food consumed
              s.targetSegments = Math.min(s.targetSegments + 1, 2000);
            }
          }
        }
      }
    }
    if (consumed.size) {
      const sorted = Array.from(consumed.values()).sort((a, b) => b - a);
      for (const idx of sorted) this.food.splice(idx, 1);
    }

    // Snake head to other snakes' body collision -> remove snake
    type BodyRef = { x: number; y: number; r: number; ownerId: string };
    const bodyGrid = new Map<string, BodyRef[]>();
    for (const s of this.snakes.values()) {
      for (let i = 0; i < s.segments.length; i++) {
        const p = s.segments[i]!;
        const k = keyOf(p.x, p.y);
        let arr = bodyGrid.get(k);
        if (!arr) {
          arr = [];
          bodyGrid.set(k, arr);
        }
        arr.push({ x: p.x, y: p.y, r: s.radius, ownerId: s.id });
      }
    }

    const toRemove: string[] = [];
    for (const s of this.snakes.values()) {
      const head = s.segments[0]!;
      const r = s.radius;
      const minCx = Math.floor((head.x - r) / cellSize);
      const maxCx = Math.floor((head.x + r) / cellSize);
      const minCy = Math.floor((head.y - r) / cellSize);
      const maxCy = Math.floor((head.y + r) / cellSize);
      let dead = false;
      for (let cx = minCx; cx <= maxCx && !dead; cx++) {
        for (let cy = minCy; cy <= maxCy && !dead; cy++) {
          const k = `${cx},${cy}`;
          const refs = bodyGrid.get(k);
          if (!refs) continue;
          for (const ref of refs) {
            if (ref.ownerId === s.id) continue; // ignore own body for now
            const rr = r + ref.r;
            if (distSq(head.x, head.y, ref.x, ref.y) <= rr * rr) {
              dead = true;
              break;
            }
          }
        }
      }
      if (dead) toRemove.push(s.id);
    }
    if (toRemove.length) this.killSnakes(toRemove, true);
  }

  private killSnakes(ids: string[], dropFood: boolean): void {
    for (const id of ids) {
      const snake = this.snakes.get(id);
      if (snake && dropFood) {
        for (let i = 0; i < Math.min(10, snake.segments.length); i++) {
          const p = snake.segments[Math.floor((i * snake.segments.length) / 10)]!;
          this.food.push({ id: this.nextFoodId++, x: p.x, y: p.y, radius: FOOD.radius, color: snake.color });
        }
      }
      this.snakes.delete(id);
    }
  }

  private maintainFoodPopulation() {
    const deficit = Math.max(0, FOOD.targetCount - this.food.length);
    const toSpawn = Math.min(deficit, FOOD.perTickSpawnMax);
    for (let i = 0; i < toSpawn; i++) this.spawnFood();
  }

  private spawnFood() {
    const f: Food = {
      id: this.nextFoodId++,
      x: randomInRange(0, this.width),
      y: randomInRange(0, this.height),
      radius: FOOD.radius,
      color: FOOD.colors[Math.floor(Math.random() * FOOD.colors.length)] || 0xffffff,
    };
    this.food.push(f);
  }

  getSnakes(): ReadonlyMap<string, Snake> {
    return this.snakes;
  }

  getFood(): readonly Food[] {
    return this.food;
  }

  private getMaxSegmentsForDistance(distance: number): number {
    const config = NETWORK.tailSubsampling;
    if (distance <= config.nearDistance) {
      return config.nearSegments;
    } else if (distance <= config.mediumDistance) {
      return config.mediumSegments;
    } else if (distance <= config.farDistance) {
      return config.farSegments;
    } else {
      return config.veryFarSegments;
    }
  }

  private subsampleSegments(segments: Array<[number, number]>, maxSegments: number): Array<[number, number]> {
    if (segments.length <= maxSegments) return segments;
    
    // Always keep the head (first segment)
    const result: Array<[number, number]> = [segments[0]!];
    
    // Calculate step size for uniform sampling of the tail
    const step = (segments.length - 1) / (maxSegments - 1);
    
    for (let i = 1; i < maxSegments; i++) {
      const index = Math.round(i * step);
      result.push(segments[index]!);
    }
    
    return result;
  }

  createPublicSnapshot(tick: number, now: number): PublicSnapshot {
    return {
      tick,
      now,
      world: { width: this.width, height: this.height },
      snakes: Array.from(this.snakes.values()).map((s) => ({
        id: s.id,
        name: s.name,
        color: s.color,
        radius: s.radius,
        segments: s.segments.map((p) => [p.x, p.y]),
      })),
      food: this.food.map((f) => [f.id, f.x, f.y, f.radius, f.color]),
    };
  }

  createViewSnapshot(tick: number, now: number, cx: number, cy: number, r: number): PublicSnapshot {
    const r2 = r * r;
    const snakes: PublicSnapshot["snakes"] = [];
    for (const s of this.snakes.values()) {
      // include snake if head within view radius (simple heuristic)
      const h = s.segments[0]!;
      const dx = h.x - cx;
      const dy = h.y - cy;
      const distSq = dx * dx + dy * dy;
      if (distSq > r2) continue;
      
      // Tail subsampling based on distance
      let segments = s.segments.map((p) => [p.x, p.y] as [number, number]);
      
      if (NETWORK.tailSubsampling.enabled) {
        const distance = Math.sqrt(distSq);
        const maxSegments = this.getMaxSegmentsForDistance(distance);
        if (segments.length > maxSegments) {
          segments = this.subsampleSegments(segments, maxSegments);
        }
      }
      
      snakes.push({
        id: s.id,
        name: s.name,
        color: s.color,
        radius: s.radius,
        segments,
      });
    }
    const food: PublicSnapshot["food"] = [] as any;
    for (const f of this.food) {
      const dx = f.x - cx;
      const dy = f.y - cy;
      if (dx * dx + dy * dy <= r2) {
        (food as any).push([f.id, f.x, f.y, f.radius, f.color]);
      }
    }
    return { tick, now, world: { width: this.width, height: this.height }, snakes, food };
  }
}


