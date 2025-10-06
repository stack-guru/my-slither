import { WebSocketServer, WebSocket } from "ws";
import { performance } from "node:perf_hooks";
import { NETWORK } from "../config.js";
import { ClientToServerMessage, ServerToClientMessage, PublicSnapshot } from "../types.js";
import { World } from "../world.js";
import { ClientToServerSchema } from "../validation.js";
import { Encoder } from "msgpackr";

type ServerDeps = { port: number; world: World };

export function createWSServer({ port, world }: ServerDeps) {
  const wss = new WebSocketServer({ port, perMessageDeflate: false, maxPayload: NETWORK.maxMessageSizeBytes });

  type Client = { 
    id: string; 
    ws: WebSocket; 
    name: string; 
    color: number; 
    lastInputSec: number; 
    budget: number;
    pendingMessages: ServerToClientMessage[];
    // Delta tracking
    lastSnapshot: PublicSnapshot | null;
    lastTick: number;
    // Adaptive rate tracking
    lastUpdateTick: number;
    updateRate: number; // Current update rate (1, 2, or 4)
  };
  const clients = new Map<WebSocket, Client>();
  
  const encoder = new Encoder();

  function send(ws: WebSocket, msg: ServerToClientMessage) {
    try {
      const encoded = encoder.encode(msg);
      ws.send(encoded);
    } catch {}
  }

  function sendBatch(ws: WebSocket, messages: ServerToClientMessage[]) {
    if (messages.length === 0) return;
    try {
      if (messages.length === 1) {
        // Single message - send directly
        const encoded = encoder.encode(messages[0]);
        ws.send(encoded);
      } else {
        // Multiple messages - batch them
        const batch = { type: "batch", messages } as const;
        const encoded = encoder.encode(batch);
        ws.send(encoded);
      }
    } catch {}
  }

  function flushClient(client: Client) {
    if (client.pendingMessages.length > 0) {
      sendBatch(client.ws, client.pendingMessages);
      client.pendingMessages = [];
    }
  }

  function getUpdateRate(distance: number): number {
    if (distance <= NETWORK.distanceThresholds.close) {
      return NETWORK.updateRates.close; // Every tick
    } else if (distance <= NETWORK.distanceThresholds.medium) {
      return NETWORK.updateRates.medium; // Every 2 ticks
    } else {
      return NETWORK.updateRates.far; // Every 4 ticks
    }
  }

  function shouldSendUpdate(client: Client, currentTick: number): boolean {
    const ticksSinceLastUpdate = currentTick - client.lastUpdateTick;
    return ticksSinceLastUpdate >= client.updateRate;
  }

  function getClosestSnakeDistance(playerSnake: any, allSnakes: ReadonlyMap<string, any>): number {
    if (!playerSnake || !playerSnake.segments.length) return NETWORK.distanceThresholds.medium;
    
    const playerHead = playerSnake.segments[0];
    let closestDistance = Infinity;
    
    for (const [id, snake] of allSnakes) {
      if (id === playerSnake.id || !snake.segments.length) continue;
      
      const otherHead = snake.segments[0];
      const distance = Math.sqrt(
        Math.pow(playerHead.x - otherHead.x, 2) + 
        Math.pow(playerHead.y - otherHead.y, 2)
      );
      
      if (distance < closestDistance) {
        closestDistance = distance;
      }
    }
    
    return closestDistance === Infinity ? NETWORK.distanceThresholds.medium : closestDistance;
  }

  function createDeltaSnapshot(currentSnapshot: PublicSnapshot, lastSnapshot: PublicSnapshot | null): ServerToClientMessage {
    if (!lastSnapshot) {
      // First snapshot - send full state
      return { type: "state", snapshot: currentSnapshot };
    }

    // Create delta by comparing current vs last snapshot
    const deltaSnakes = currentSnapshot.snakes.filter((current: any) => {
      const last = lastSnapshot.snakes.find((s: any) => s.id === current.id);
      if (!last) return true; // New snake
      
      // Check if snake changed (position, segments, etc.)
      if (current.segments.length !== last.segments.length) return true;
      for (let i = 0; i < current.segments.length; i++) {
        const [cx, cy] = current.segments[i]!;
        const [lx, ly] = last.segments[i]!;
        if (Math.abs(cx - lx) > 0.1 || Math.abs(cy - ly) > 0.1) return true;
      }
      return false;
    });

    // For food, we need to send ALL food in the viewport for proper collision detection
    // Food doesn't move, so we only need to send the complete current food list
    const deltaFood = currentSnapshot.food;

    // If too many snake changes, send full snapshot to avoid jitter
    const snakeChangeRatio = deltaSnakes.length / currentSnapshot.snakes.length;
    
    if (snakeChangeRatio > 0.5) {
      return { type: "state", snapshot: currentSnapshot };
    }

    return {
      type: "state_delta",
      tick: currentSnapshot.tick,
      now: currentSnapshot.now,
      snakes: deltaSnakes,
      food: deltaFood,
      world: currentSnapshot.world
    };
  }

  function broadcastState(snapshot: ReturnType<World["createPublicSnapshot"]>) {
    const start = performance.now();
    // Ensure clients whose snakes died are respawned before broadcasting
    for (const c of clients.values()) {
      if (!world.getSnakes().has(c.id)) {
        const newSnake = world.addSnake(c.name, c.color);
        c.id = newSnake.id;
        c.pendingMessages.push({ type: "welcome", id: c.id, world: { width: world.width, height: world.height } });
      }
    }
    let sentCount = 0;
    let fullCount = 0;
    let deltaCount = 0;
    let skippedCount = 0;
    let adaptiveSkipCount = 0;
    
    for (const c of clients.values()) {
      if (c.ws.readyState !== WebSocket.OPEN) continue;
      
      // Check backpressure - skip if client buffer is too full
      const bufferUsage = c.ws.bufferedAmount;
      const bufferLimit = NETWORK.backpressureBytes * NETWORK.backpressureSkipThreshold;
      
      if (bufferUsage > bufferLimit) {
        skippedCount++;
        // Debug: log backpressure occasionally
        if (Math.random() < 0.1) {
          console.log(`[BACKPRESSURE] Skipped client ${c.id}, buffer: ${Math.round(bufferUsage/1024)}KB/${Math.round(bufferLimit/1024)}KB`);
        }
        continue; // Skip this client to prevent overload
      }
      
      // Check adaptive update rate - skip if not time for update
      if (!shouldSendUpdate(c, snapshot.tick)) {
        adaptiveSkipCount++;
        continue; // Skip this client due to adaptive rate
      }
      
      // Update client's update rate based on closest snake distance
      const s = world.getSnakes().get(c.id);
      if (s && s.segments.length) {
        const closestDistance = getClosestSnakeDistance(s, world.getSnakes());
        const newUpdateRate = getUpdateRate(closestDistance);
        if (newUpdateRate !== c.updateRate) {
          c.updateRate = newUpdateRate;
        }
      }
      
      // Per-client view based on their snake head
      let snap = snapshot;
      if (s && s.segments.length) {
        const h = s.segments[0]!;
        snap = world.createViewSnapshot(snapshot.tick, snapshot.now, h.x, h.y, NETWORK.viewRadius);
      }
      
      // Create delta snapshot
      const deltaMsg = createDeltaSnapshot(snap, c.lastSnapshot);
      c.pendingMessages.push(deltaMsg);
      
      // Update client's last snapshot and update tracking
      c.lastSnapshot = snap;
      c.lastTick = snapshot.tick;
      c.lastUpdateTick = snapshot.tick;
      
      if (deltaMsg.type === "state") {
        fullCount++;
      } else {
        deltaCount++;
        // Debug: log delta details occasionally
        if (Math.random() < 0.01 && deltaMsg.type === "state_delta") {
          console.log(`[DEBUG] Delta: snakes=${deltaMsg.snakes.length} food=${deltaMsg.food.length}`);
        }
      }
      sentCount++;
    }
    
    // Flush all pending messages for each client
    for (const c of clients.values()) {
      if (c.ws.readyState === WebSocket.OPEN) {
        flushClient(c);
      }
    }
    const processingTime = Math.round((performance.now() - start) * 100) / 100; // 2 decimals
    if (Math.random() < 0.02) {
      const totalPlayers = world.getSnakes().size; // count all snakes, not only clients
      const foodCount = world.getFood().length;
      const batchCount = 1; // single broadcast batch
      const subsBuildCount = 0;
      const getViewCount = 0;
      const cacheReuseCount = 0;
      // Match src_demo's style and include foods for visibility
      console.log(`📡 SEND: players=${totalPlayers} foods=${foodCount} batches=${batchCount} time=${processingTime}ms full=${fullCount} delta=${deltaCount} skip=${skippedCount} adaptive=${adaptiveSkipCount} views{subs=${subsBuildCount},fallback=${getViewCount},cache=${cacheReuseCount}}`);
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
        clients.set(ws, { 
          id: clientId, 
          ws, 
          name, 
          color, 
          lastInputSec: 0, 
          budget: NETWORK.inputRateLimitPerSec, 
          pendingMessages: [],
          lastSnapshot: null,
          lastTick: 0,
          lastUpdateTick: 0,
          updateRate: NETWORK.updateRates.close
        });
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


