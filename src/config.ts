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
  spawnDelayMs: 1000, // 1 seconds delay before snake can move
};

export const FOOD = {
  radius: 3,
  targetCount: 600,
  perTickSpawnMax: 10,
  colors: [
    0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff,
    0x00ffff, 0xff8000, 0x8000ff, 0xff0080, 0x80ff00,
  ],
};

export const NETWORK = {
  maxMessageSizeBytes: 64 * 1024,
  heartbeatIntervalMs: 5000,
  inputRateLimitPerSec: 40,
  viewRadius: 600, // Increased for better visibility (was 400)
  // Backpressure settings
  backpressureBytes: 256 * 1024, // 256KB buffer limit
  backpressureSkipThreshold: 0.8, // Skip if buffer > 80% full
  // Adaptive update rates
  updateRates: {
    veryClose: 1,  // Every tick (30ms) - within 300px
    close: 1,      // Every tick (30ms) - within 600px
    medium: 2,     // Every 2 ticks (60ms) - within 1200px  
    far: 4,        // Every 4 ticks (120ms) - within viewRadius
    veryFar: 8,    // Every 8 ticks (240ms) - beyond viewRadius
  },
  distanceThresholds: {
    veryClose: 225,   // Very close distance threshold (1.5x increase)
    close: 450,       // Close distance threshold (1.5x increase)
    medium: 900,      // Medium distance threshold (1.5x increase)
    far: 1200,        // Far distance threshold (1.5x increase)
  },
  // Tail subsampling settings for bandwidth optimization
  tailSubsampling: {
    enabled: true,
    nearDistance: 300,    // Full detail within 300px (1.5x increase)
    mediumDistance: 600,  // Medium detail within 600px (1.5x increase)
    farDistance: 900,     // Low detail within 900px (1.5x increase)
    nearSegments: 999,    // Send all segments when near
    mediumSegments: 30,   // Send 30 segments when medium distance
    farSegments: 15,      // Send 15 segments when far
    veryFarSegments: 10,  // Send 10 segments when very far
  },
};

