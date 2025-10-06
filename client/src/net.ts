import { Decoder } from "msgpackr";

export type Snapshot = {
  tick: number;
  now: number;
  world: { width: number; height: number };
  snakes: Array<{ id: string; name: string; color: number; radius: number; segments: Array<[number, number]> }>;
  food: Array<[number, number, number, number, number]>; // id,x,y,r,color
};

let ws: WebSocket | null = null;
const decoder = new Decoder();
let myId = "";
let cb: ((s: Snapshot) => void) | null = null;
let connectAttempts = 0;
let lastSnapshotLoggedAt = 0;

export function onSnapshot(fn: (s: Snapshot) => void) {
  cb = fn;
}

export function connect(host?: string, port?: number) {
  const resolvedHost = host || location.hostname || "localhost";
  const envUrl = (import.meta as any).env?.VITE_WS_URL as string | undefined;
  const resolvedPort = port || Number((import.meta as any).env?.VITE_WS_PORT) || 8080;
  const url = envUrl || `ws://${resolvedHost}:${resolvedPort}`;
  connectAttempts++;
  console.log(`[WS] connecting to ${url} (attempt ${connectAttempts})`);

  ws = new WebSocket(url);
  ws.onopen = () => {
    console.log("[WS] open");
    ws?.send(JSON.stringify({ type: "hello", name: "WebClient" }));
  };
  ws.onmessage = (ev) => {
    let msg: any;
    try {
      // Handle both binary (MessagePack) and text (JSON) messages
      if (ev.data instanceof ArrayBuffer) {
        msg = decoder.decode(new Uint8Array(ev.data));
      } else if (ev.data instanceof Blob) {
        // Convert Blob to ArrayBuffer for MessagePack
        ev.data.arrayBuffer().then(buffer => {
          try {
            const msg = decoder.decode(new Uint8Array(buffer));
            handleMessage(msg);
          } catch (e) {
            console.warn("[WS] MessagePack decode failed", e);
          }
        });
        return;
      } else {
        // Fallback to JSON for text messages
        msg = JSON.parse(String(ev.data));
      }
      handleMessage(msg);
    } catch (e) {
      console.warn("[WS] message decode failed", e);
      return;
    }
  };

  function handleMessage(msg: any) {
    if (!msg) return;
    
    if (msg.type === "batch") {
      // Handle batched messages
      for (const batchedMsg of msg.messages) {
        handleMessage(batchedMsg);
      }
      return;
    }
    
    if (msg.type === "welcome") {
      myId = msg.id;
      console.log(`[WS] welcome id=${myId}, world=${msg.world?.width}x${msg.world?.height}`);
    } else if (msg.type === "state") {
      const snap = msg.snapshot as Snapshot;
      const now = Date.now();
      if (now - lastSnapshotLoggedAt > 1000) {
        console.log(`[WS] state tick=${snap.tick} snakes=${snap.snakes.length} food=${snap.food.length}`);
        lastSnapshotLoggedAt = now;
      }
      cb?.(snap);
    }
  };
  ws.onerror = (e) => {
    console.error("[WS] error", e);
  };
  ws.onclose = (ev) => {
    console.warn(`[WS] close code=${ev.code} reason=${ev.reason}`);
    ws = null;
    setTimeout(() => connect(resolvedHost, resolvedPort), 1000);
  };
}

export function sendInput(angle: number, boost: boolean) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "input", angle, boost }));
  }
}

export function getMyId(): string {
  return myId;
}


