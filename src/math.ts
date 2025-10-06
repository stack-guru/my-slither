export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function distSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function normalizeAngleRad(a: number): number {
  let x = a % (Math.PI * 2);
  if (x <= -Math.PI) x += Math.PI * 2;
  if (x > Math.PI) x -= Math.PI * 2;
  return x;
}

export function rotateTowards(current: number, target: number, maxDelta: number): number {
  let delta = normalizeAngleRad(target - current);
  if (Math.abs(delta) <= maxDelta) return normalizeAngleRad(target);
  return normalizeAngleRad(current + Math.sign(delta) * maxDelta);
}


