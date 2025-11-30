// === CORE TYPES ===

export interface Vector2 {
  x: number;
  y: number;
}

// === SHIP ===

export interface Ship {
  id: string;
  playerId: string;
  position: Vector2;
  velocity: Vector2;
  rotation: number; // Radians
  isThrusting: boolean;
  color: string;
  name: string;
  score: number;
  isAlive: boolean;
  respawnTimer: number; // 0 = alive, >0 = seconds until respawn
  fireCooldown: number; // 0 = can fire
  invulnTimer: number; // >0 = invulnerable (can't shoot or be hit)
}

// === ASTEROID ===

export interface Asteroid {
  id: string;
  position: Vector2;
  velocity: Vector2;
  rotation: number;
  angularVelocity: number;
  size: 'large' | 'medium' | 'small';
  radius: number;
}

// === BULLET ===

export interface Bullet {
  id: string;
  ownerId: string; // Ship ID that fired it
  ownerColor: string;
  position: Vector2;
  velocity: Vector2;
  lifetime: number; // Seconds remaining
}

// === EXPLOSION ===

export interface Explosion {
  id: string;
  position: Vector2;
  color: string;
  size: 'small' | 'medium' | 'large'; // small=bullet, medium=ship, large=big asteroid
  lifetime: number; // Seconds remaining (starts at ~0.5)
  maxLifetime: number; // For calculating progress
}

// === GAME MODES ===

export type GameMode = 'ffa' | 'asteroid_hunters' | 'knockout';

export const GAME_MODE_NAMES: Record<GameMode, string> = {
  ffa: 'Free-for-All',
  asteroid_hunters: 'Asteroid Hunters',
  knockout: 'Knockout',
};

export const GAME_MODE_DESCRIPTIONS: Record<GameMode, string> = {
  ffa: 'PvP combat, respawn on death, highest score wins',
  asteroid_hunters: 'PvP + Asteroids, respawn on death, highest score wins',
  knockout: 'One life only, last one standing wins',
};

// === PLAYER STATS ===

export interface PlayerStats {
  playerId: string;
  playerName: string;
  playerColor: string;
  kills: number;
  deaths: number;
  shotsFired: number;
  shotsHit: number;
  asteroidsDestroyed: number;
  nemesis: { id: string; name: string; count: number } | null; // Who killed this player most
  victim: { id: string; name: string; count: number } | null; // Who this player killed most
}

// === GAME STATE ===

export interface GameState {
  tick: number;
  timestamp: number;
  phase: 'lobby' | 'playing' | 'gameover';
  ships: Ship[];
  asteroids: Asteroid[];
  bullets: Bullet[];
  explosions: Explosion[];
  worldSize: Vector2;
  timeRemaining: number; // Seconds remaining in game (180 = 3 minutes)
  gameMode: GameMode;
  stats: PlayerStats[]; // Player statistics
}

// === PLAYER/ROOM ===

export interface Player {
  id: string;
  name: string;
  color: string;
  isConnected: boolean;
}

export interface RoomInfo {
  code: string;
  players: Player[];
  maxPlayers: number;
  phase: GameState['phase'];
  leaderId: string | null; // First player to join - can start the game
  gameMode: GameMode;
}

// === INPUT ===

export interface PlayerInput {
  sequenceNumber: number;
  rotation: number; // -1 (left) to 1 (right) - from tilt
  thrust: boolean;
  fire: boolean;
  timestamp: number;
}
