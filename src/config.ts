export const TICK_MS = 30;
export const SPAWN_COUNT = 50;

export const WORLD = {
  width: 3000,
  height: 3000,
};

export const SNAKE = {
  baseSpeedUnitsPerSec: 140,
  radius: 14,
  initialSegments: 10,
  boostMultiplier: 2.5,
  segmentSpacing: 4,
  turnSpeedRadiansPerSec: Math.PI * 2,
};

export const FOOD = {
  radius: 3,
  targetCount: 600,
  perTickSpawnMax: 10,
  colors: [
    0xffffff, 0xffb6c1, 0xadd8e6, 0x90ee90, 0xffdab9,
    0xdda0dd, 0xffffe0, 0xb0c4de, 0xffc0cb, 0x98fb98,
  ],
};

export const NETWORK = {
  maxMessageSizeBytes: 64 * 1024,
  heartbeatIntervalMs: 5000,
  inputRateLimitPerSec: 40,
  viewRadius: 1200,
};

