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

// === GAME STATE ===

export interface GameState {
  tick: number;
  timestamp: number;
  phase: 'lobby' | 'playing' | 'gameover';
  ships: Ship[];
  asteroids: Asteroid[];
  bullets: Bullet[];
  worldSize: Vector2;
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
}

// === INPUT ===

export interface PlayerInput {
  sequenceNumber: number;
  rotation: number; // -1 (left) to 1 (right) - from tilt
  thrust: boolean;
  fire: boolean;
  timestamp: number;
}
