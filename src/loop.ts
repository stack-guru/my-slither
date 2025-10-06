import { performance } from "node:perf_hooks";
export type StopLoop = () => void;

export function startGameLoop(
  fixedTickMs: number,
  onTick: (dtSeconds: number, nowMs: number, tick: number) => void
): StopLoop {
  let running = true;
  let tick = 0;
  const dtSeconds = fixedTickMs / 1000;
  let nextTarget = performance.now();

  function loop() {
    if (!running) return;
    const now = performance.now();

    if (now >= nextTarget) {
      try {
        onTick(dtSeconds, now, tick++);
      } catch (err) {
        // Do not crash the loop; log and continue
        // eslint-disable-next-line no-console
        console.error("Tick error:", err);
      }
      // schedule next tick based on target to minimize drift
      nextTarget += fixedTickMs;

      // If we fell behind by more than one frame, skip forward but cap to avoid spiral of death
      const maxCatchup = fixedTickMs * 5;
      if (now - nextTarget > maxCatchup) {
        nextTarget = now + fixedTickMs;
      }
    }

    const delay = Math.max(0, nextTarget - performance.now());
    setTimeout(loop, delay);
  }

  setTimeout(loop, 0);

  return () => {
    running = false;
  };
}


