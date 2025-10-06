import { TICK_MS, WORLD as WORLD_CFG, SPAWN_COUNT } from "./config.js";
import { startGameLoop } from "./loop.js";
import { World } from "./world.js";
import { createWSServer } from "./server/ws.js";
import { BotManager } from "./bots.js";

const PORT = Number(process.env.PORT || 8080);

const world = new World(WORLD_CFG.width, WORLD_CFG.height);
const server = createWSServer({ port: PORT, world });
const bots = new BotManager();
bots.spawnBots(world, SPAWN_COUNT);

const stopLoop = startGameLoop(TICK_MS, (dtSeconds, nowMs, tick) => {
  bots.update(world, nowMs);
  world.update(dtSeconds);
  server.broadcastState(world.createPublicSnapshot(tick, nowMs));
});

process.on("SIGINT", () => {
  stopLoop();
  server.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  stopLoop();
  server.close();
  process.exit(0);
});

