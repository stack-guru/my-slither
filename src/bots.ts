import { World } from "./world.js";

type BotState = {
  id: string;
  nextRetargetMs: number;
  targetAngle: number;
  boostUntilMs: number;
  name: string;
  color: number;
};

function randRange(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function angleTo(ax: number, ay: number, bx: number, by: number): number {
  return Math.atan2(by - ay, bx - ax);
}

export class BotManager {
  private bots: Map<string, BotState> = new Map();

  spawnBots(world: World, count: number): void {
    for (let i = 0; i < count; i++) {
      const name = `Bot ${i + 1}`;
      const color = Math.floor(Math.random() * 0xffffff);
      const snake = world.addSnake(name, color);
      const now = Date.now();
      this.bots.set(snake.id, {
        id: snake.id,
        nextRetargetMs: now + Math.floor(randRange(800, 2200)),
        targetAngle: snake.angle,
        boostUntilMs: 0,
        name,
        color,
      });
    }
  }

  update(world: World, nowMs: number): void {
    // Clean up entries for snakes that no longer exist
    for (const [id, bot] of this.bots) {
      if (!world.getSnakes().has(id)) {
        // Respawn bot at a new random position
        const snake = world.addSnake(bot.name, bot.color);
        // Replace key in map: delete old, insert new id
        this.bots.delete(id);
        bot.id = snake.id;
        bot.nextRetargetMs = nowMs + Math.floor(randRange(500, 1500));
        bot.targetAngle = snake.angle;
        bot.boostUntilMs = 0;
        this.bots.set(bot.id, bot);
        continue;
      }
    }

    for (const bot of this.bots.values()) {
      const snake = world.getSnakes().get(bot.id);
      if (!snake) continue;

      // Retarget towards nearest food sometimes; otherwise wander randomly
      if (nowMs >= bot.nextRetargetMs) {
        bot.nextRetargetMs = nowMs + Math.floor(randRange(700, 1800));

        // 60% chance: aim at nearest food within a search radius
        const head = snake.segments[0]!;
        const searchRadius = 300;
        let bestDistSq = Number.POSITIVE_INFINITY;
        let bestAngle: number | null = null;
        if (Math.random() < 0.6) {
          for (const f of world.getFood()) {
            const dx = f.x - head.x;
            const dy = f.y - head.y;
            if (Math.abs(dx) > searchRadius || Math.abs(dy) > searchRadius) continue;
            const d2 = dx * dx + dy * dy;
            if (d2 < bestDistSq) {
              bestDistSq = d2;
              bestAngle = Math.atan2(dy, dx);
            }
          }
        }
        let desired = bestAngle !== null ? bestAngle : randRange(-Math.PI, Math.PI);

        // Wall avoidance: steer away when close to borders
        const head2 = snake.segments[0]!;
        const margin = 120;
        if (head2.x < margin) desired = 0; // steer right
        else if (head2.x > world.width - margin) desired = Math.PI; // steer left
        if (head2.y < margin) desired = Math.PI / 2; // steer down
        else if (head2.y > world.height - margin) desired = -Math.PI / 2; // steer up

        // Simple snake avoidance: look ahead and nudge angle away from nearest segment within cone
        const lookAhead = 140;
        let avoidBias = 0;
        for (const other of world.getSnakes().values()) {
          for (let i = 0; i < other.segments.length; i++) {
            const p = other.segments[i]!;
            const dx = p.x - head2.x;
            const dy = p.y - head2.y;
            if (Math.abs(dx) > lookAhead || Math.abs(dy) > lookAhead) continue;
            const d2 = dx * dx + dy * dy;
            if (d2 < lookAhead * lookAhead && d2 > 1) {
              const ang = Math.atan2(dy, dx);
              // If the point is roughly ahead (within 90 degrees), bias away
              let delta = Math.atan2(Math.sin(ang - snake.angle), Math.cos(ang - snake.angle));
              if (Math.abs(delta) < Math.PI / 2) avoidBias += -Math.sign(delta) * 0.25; // steer away
            }
          }
        }
        desired += avoidBias;
        bot.targetAngle = desired;

        // Occasionally boost for a short burst
        if (Math.random() < 0.2) {
          bot.boostUntilMs = nowMs + Math.floor(randRange(300, 900));
        } else {
          bot.boostUntilMs = 0;
        }
      }

      const boosting = nowMs < bot.boostUntilMs;
      world.setSnakeInput(bot.id, bot.targetAngle, boosting);
    }
  }
}


