import { WebSocketServer, WebSocket } from "ws";
import { performance } from "node:perf_hooks";
import { NETWORK } from "../config.js";
import { ClientToServerMessage, ServerToClientMessage } from "../types.js";
import { World } from "../world.js";
import { ClientToServerSchema } from "../validation.js";

type ServerDeps = { port: number; world: World };

export function createWSServer({ port, world }: ServerDeps) {
  const wss = new WebSocketServer({ port, perMessageDeflate: false, maxPayload: NETWORK.maxMessageSizeBytes });

  type Client = { id: string; ws: WebSocket; name: string; color: number; lastInputSec: number; budget: number };
  const clients = new Map<WebSocket, Client>();

  function send(ws: WebSocket, msg: ServerToClientMessage) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {}
  }

  function broadcastState(snapshot: ReturnType<World["createPublicSnapshot"]>) {
    const start = performance.now();
    // Ensure clients whose snakes died are respawned before broadcasting
    for (const c of clients.values()) {
      if (!world.getSnakes().has(c.id)) {
        const newSnake = world.addSnake(c.name, c.color);
        c.id = newSnake.id;
        send(c.ws, { type: "welcome", id: c.id, world: { width: world.width, height: world.height } });
      }
    }
    const payload = JSON.stringify({ type: "state", snapshot } as ServerToClientMessage);
    let sentCount = 0;
    for (const c of clients.values()) {
      if (c.ws.readyState === WebSocket.OPEN) {
        c.ws.send(payload);
        sentCount++;
      }
    }
    const processingTime = Math.round((performance.now() - start) * 100) / 100; // 2 decimals
    if (Math.random() < 0.02) {
      const totalPlayers = world.getSnakes().size; // count all snakes, not only clients
      const foodCount = world.getFood().length;
      const batchCount = 1; // single broadcast batch
      const fullCount = sentCount; // we only send full snapshots
      const deltaCount = 0;
      const deltaSkipCountLocal = 0;
      const subsBuildCount = 0;
      const getViewCount = 0;
      const cacheReuseCount = 0;
      // Match src_demo's style and include foods for visibility
      console.log(`📡 SEND: players=${totalPlayers} foods=${foodCount} batches=${batchCount} time=${processingTime}ms full=${fullCount} delta=${deltaCount} skip=${deltaSkipCountLocal} views{subs=${subsBuildCount},fallback=${getViewCount},cache=${cacheReuseCount}}`);
    }
  }

  wss.on("connection", (ws) => {
    let clientId = "";
    (ws as any).isAlive = true;
    ws.on("pong", () => ((ws as any).isAlive = true));

    ws.on("message", (data) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(data));
      } catch {
        return;
      }
      const result = ClientToServerSchema.safeParse(parsed);
      if (!result.success) return;
      const msg = result.data as ClientToServerMessage;

      if (msg.type === "hello") {
        const name = msg.name || "Player";
        const color = Math.floor(Math.random() * 0xffffff);
        const snake = world.addSnake(name, color);
        clientId = snake.id;
        clients.set(ws, { id: clientId, ws, name, color, lastInputSec: 0, budget: NETWORK.inputRateLimitPerSec });
        send(ws, { type: "welcome", id: clientId, world: { width: world.width, height: world.height } });
        return;
      }

      if (msg.type === "input") {
        const c = clients.get(ws);
        if (!c) return;
        const nowSec = Date.now() / 1000;
        if (c.lastInputSec === 0) c.lastInputSec = nowSec;
        const elapsed = Math.max(0, nowSec - c.lastInputSec);
        c.lastInputSec = nowSec;
        c.budget = Math.min(NETWORK.inputRateLimitPerSec, c.budget + elapsed * NETWORK.inputRateLimitPerSec);
        if (c.budget < 1) return; // drop input
        c.budget -= 1;
        // Always direct input to the latest snake id (after respawn)
        world.setSnakeInput(c.id, msg.angle, msg.boost);
      }
    });

    ws.on("close", () => {
      const c = clients.get(ws);
      if (c) {
        // Respawn a new snake for this player immediately
        const newSnake = world.respawnSnake(c.id, c.name, c.color);
        clients.set(ws, { ...c, id: newSnake.id });
      }
    });
  });

  const heartbeat = setInterval(() => {
    for (const [ws] of clients) {
      if ((ws as any).isAlive === false) {
        ws.terminate();
        continue;
      }
      (ws as any).isAlive = false;
      try {
        ws.ping();
      } catch {}
    }
  }, NETWORK.heartbeatIntervalMs);

  function close() {
    clearInterval(heartbeat);
    for (const [ws] of clients) {
      try {
        ws.close();
      } catch {}
    }
    wss.close();
  }

  return { broadcastState, close };
}


