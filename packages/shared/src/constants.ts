export const GAME_CONFIG = {
  // World
  WORLD_WIDTH: 1920,
  WORLD_HEIGHT: 1080,

  // Timing
  TICK_RATE: 60,
  BROADCAST_RATE: 30, // State broadcasts per second

  // Ship
  SHIP_RADIUS: 8, // Hitbox radius (visual size is larger)
  SHIP_MAX_SPEED: 1200,
  SHIP_ACCELERATION: 120, // Punchy acceleration
  SHIP_ROTATION_SPEED: 3.0, // Radians per second (tilt-based) - 2.5x faster
  SHIP_DRAG: 0.995, // Half of previous max speed
  SHIP_RESPAWN_TIME: 3, // Seconds
  SHIP_INVULN_TIME: 2, // Seconds of invulnerability after spawn

  // Bullets
  BULLET_SPEED: 345, // 2.5x faster
  BULLET_LIFETIME: 1.2, // Seconds
  BULLET_RADIUS: 1.5, // Half size
  FIRE_COOLDOWN: 0.625, // Seconds between shots (doubled fire rate)

  // Asteroids
  ASTEROID_SIZES: {
    large: { radius: 25, score: 20, speed: 60 },
    medium: { radius: 15, score: 50, speed: 90 },
    small: { radius: 8, score: 100, speed: 130 },
  } as const,
  INITIAL_ASTEROIDS: 0,
  MAX_ASTEROIDS: 0,
  ASTEROID_SPAWN_INTERVAL: 12, // Seconds

  // Scoring
  KILL_SCORE: 200,

  // Room
  MAX_PLAYERS: 10,
  MIN_PLAYERS_TO_START: 1,

  // Colors
  PLAYER_COLORS: [
    '#FF6B6B', // Coral red
    '#4ECDC4', // Teal
    '#FFE66D', // Yellow
    '#95E1D3', // Mint
    '#F38181', // Salmon
    '#AA96DA', // Lavender
    '#FCBAD3', // Pink
    '#A8D8EA', // Sky blue
    '#FF9F43', // Orange
    '#5F27CD', // Purple
  ],
} as const;

// Network
export const SERVER_PORT = 3000;
export const DISPLAY_PORT = 5173;
export const CONTROLLER_PORT = 5174;

// Cloud-hosted controller URL (set to your Vercel domain)
// When set, QR codes will point here instead of local IP
export const CONTROLLER_URL = 'https://gamezero.live';
