export const TICK_MS = 30;
export const SPAWN_COUNT = 50;

export const WORLD = {
  width: 3000,
  height: 3000,
};

export const SNAKE = {
  baseSpeedUnitsPerSec: 120,
  radius: 14,
  initialSegments: 20,
  boostMultiplier: 2,
  segmentSpacing: 2,
  turnSpeedRadiansPerSec: Math.PI * 1.5,
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
  viewRadius: 400, // Reduced for better performance with 200 users
  // Backpressure settings
  backpressureBytes: 256 * 1024, // 256KB buffer limit
  backpressureSkipThreshold: 0.8, // Skip if buffer > 80% full
  // Adaptive update rates
  updateRates: {
    veryClose: 1,  // Every tick (30ms) - within 200px
    close: 1,      // Every tick (30ms) - within 400px
    medium: 2,     // Every 2 ticks (60ms) - within 800px  
    far: 4,        // Every 4 ticks (120ms) - within viewRadius
    veryFar: 8,    // Every 8 ticks (240ms) - beyond viewRadius
  },
  distanceThresholds: {
    veryClose: 150,  // Very close distance threshold (reduced for 200 users)
    close: 300,       // Close distance threshold
    medium: 600,      // Medium distance threshold
    far: 800,         // Far distance threshold (reduced for 200 users)
  },
};

