# COSMIC CHAOS: Competitive Asteroids with Smartphone Controllers

## Technical Specification Document

**Version:** 1.0  
**Author:** Claude (for handoff to Claude Code)  
**Target:** Bar/venue multiplayer game displayed on large screen TV

---

## 1. Project Overview

### 1.1 Concept
A 2-10 player competitive Asteroids-style game displayed on a large screen. Players use their smartphones as controllers by visiting a web URL—no app download required. Ships compete to destroy asteroids and each other in a chaotic, social gaming experience.

### 1.2 Core Experience
- Walk into a bar, see game on TV with QR code/URL
- Scan code on phone, enter 4-letter room code
- Phone becomes your controller (virtual joystick + fire button)
- Survive, score points, trash talk friends

### 1.3 Technical Goals
- Sub-100ms perceived input latency
- Support 10 concurrent players
- Zero app installation friction
- Run on commodity hardware (Raspberry Pi 4 or mini PC)

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         LOCAL NETWORK                           │
│                                                                 │
│  ┌──────────────┐         ┌──────────────────────────────────┐ │
│  │   DISPLAY    │◄───────►│          GAME SERVER             │ │
│  │   CLIENT     │  WS     │                                  │ │
│  │  (Browser)   │         │  - Game loop (60 tick/sec)       │ │
│  │              │         │  - Physics engine                │ │
│  │  - Pixi.js   │         │  - WebSocket server              │ │
│  │  - Rendering │         │  - Room management               │ │
│  │  - Effects   │         │  - State broadcast               │ │
│  └──────────────┘         │                                  │ │
│        ▲                  └──────────────────────────────────┘ │
│        │                              ▲                        │
│   HDMI to TV                          │ WebSocket              │
│                                       │                        │
│                    ┌──────────────────┼──────────────────┐     │
│                    │                  │                  │     │
│               ┌────┴────┐       ┌─────┴────┐      ┌─────┴────┐ │
│               │ PHONE 1 │       │ PHONE 2  │ ...  │ PHONE 10 │ │
│               │Controller│       │Controller│      │Controller│ │
│               └─────────┘       └──────────┘      └──────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 2.1 Components

| Component | Technology | Responsibility |
|-----------|------------|----------------|
| Game Server | Node.js + ws | Authoritative game state, physics, broadcasting |
| Display Client | React + Pixi.js | Rendering, interpolation, effects |
| Phone Controller | React (mobile web) | Input capture, haptic feedback |
| Shared | TypeScript types | Message schemas, game constants |

---

## 3. Project Structure

```
cosmic-chaos/
├── package.json                 # Monorepo root
├── turbo.json                   # Turborepo config
├── packages/
│   ├── shared/                  # Shared types and constants
│   │   ├── package.json
│   │   └── src/
│   │       ├── types.ts         # All TypeScript interfaces
│   │       ├── constants.ts     # Game constants
│   │       └── messages.ts      # WebSocket message schemas
│   │
│   ├── server/                  # Game server
│   │   ├── package.json
│   │   └── src/
│   │       ├── index.ts         # Entry point
│   │       ├── GameServer.ts    # WebSocket + HTTP server
│   │       ├── Room.ts          # Room/lobby management
│   │       ├── GameLoop.ts      # Fixed timestep game loop
│   │       ├── Physics.ts       # Collision detection, movement
│   │       └── entities/
│   │           ├── Ship.ts
│   │           ├── Asteroid.ts
│   │           ├── Bullet.ts
│   │           └── PowerUp.ts
│   │
│   ├── display/                 # TV display client
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   └── src/
│   │       ├── main.tsx
│   │       ├── App.tsx
│   │       ├── game/
│   │       │   ├── GameRenderer.ts    # Pixi.js setup
│   │       │   ├── Interpolator.ts    # State interpolation
│   │       │   ├── ParticleSystem.ts  # Explosions, trails
│   │       │   └── sprites/
│   │       │       ├── ShipSprite.ts
│   │       │       ├── AsteroidSprite.ts
│   │       │       └── effects/
│   │       ├── components/
│   │       │   ├── Lobby.tsx          # Join screen with QR
│   │       │   ├── Scoreboard.tsx
│   │       │   └── GameOver.tsx
│   │       └── hooks/
│   │           └── useGameState.ts
│   │
│   └── controller/              # Phone controller client
│       ├── package.json
│       ├── vite.config.ts
│       └── src/
│           ├── main.tsx
│           ├── App.tsx
│           ├── components/
│           │   ├── JoinScreen.tsx     # Room code entry
│           │   ├── Controller.tsx     # Main control surface
│           │   ├── VirtualJoystick.tsx
│           │   ├── FireButton.tsx
│           │   └── DeadScreen.tsx     # When eliminated
│           └── hooks/
│               ├── useConnection.ts
│               ├── useHaptics.ts
│               └── useOrientation.ts  # Tilt controls (optional)
│
├── scripts/
│   └── generate-qr.ts           # QR code generation utility
│
└── docker-compose.yml           # For deployment
```

---

## 4. Shared Types (packages/shared/src/types.ts)

```typescript
// === ENTITIES ===

export interface Vector2 {
  x: number;
  y: number;
}

export interface Ship {
  id: string;
  playerId: string;
  position: Vector2;
  velocity: Vector2;
  rotation: number;        // Radians
  angularVelocity: number;
  health: number;
  score: number;
  isThrusting: boolean;
  isAlive: boolean;
  respawnTimer: number;    // 0 = alive, >0 = seconds until respawn
  color: string;           // Hex color for this player
  name: string;
}

export interface Asteroid {
  id: string;
  position: Vector2;
  velocity: Vector2;
  rotation: number;
  angularVelocity: number;
  size: 'large' | 'medium' | 'small';
  radius: number;
  variant: number;         // Visual variant (0-3)
}

export interface Bullet {
  id: string;
  ownerId: string;         // Ship ID that fired it
  position: Vector2;
  velocity: Vector2;
  lifetime: number;        // Seconds remaining
}

export interface PowerUp {
  id: string;
  position: Vector2;
  type: 'shield' | 'rapidfire' | 'spread' | 'nuke';
  lifetime: number;
}

// === GAME STATE ===

export interface GameState {
  tick: number;
  timestamp: number;       // Server timestamp
  phase: 'lobby' | 'countdown' | 'playing' | 'gameover';
  ships: Ship[];
  asteroids: Asteroid[];
  bullets: Bullet[];
  powerUps: PowerUp[];
  worldSize: Vector2;      // Playfield dimensions
  countdownSeconds?: number;
  winnerIds?: string[];
}

// === PLAYER/ROOM ===

export interface Player {
  id: string;
  name: string;
  color: string;
  isReady: boolean;
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
  sequenceNumber: number;  // For input acknowledgment
  rotation: number;        // -1 (left) to 1 (right)
  thrust: boolean;
  fire: boolean;
  timestamp: number;
}
```

---

## 5. WebSocket Messages (packages/shared/src/messages.ts)

```typescript
// === CLIENT -> SERVER (Controller) ===

export interface JoinRoomMessage {
  type: 'join_room';
  roomCode: string;
  playerName: string;
}

export interface PlayerReadyMessage {
  type: 'player_ready';
  ready: boolean;
}

export interface PlayerInputMessage {
  type: 'player_input';
  input: PlayerInput;
}

export interface LeaveRoomMessage {
  type: 'leave_room';
}

// === CLIENT -> SERVER (Display) ===

export interface CreateRoomMessage {
  type: 'create_room';
}

export interface StartGameMessage {
  type: 'start_game';
}

export interface DisplayConnectMessage {
  type: 'display_connect';
  roomCode: string;
}

// === SERVER -> CLIENT (All) ===

export interface RoomUpdateMessage {
  type: 'room_update';
  room: RoomInfo;
}

export interface GameStateMessage {
  type: 'game_state';
  state: GameState;
  yourShipId?: string;     // Only sent to controllers
}

export interface InputAckMessage {
  type: 'input_ack';
  sequenceNumber: number;
  serverTick: number;
}

export interface ErrorMessage {
  type: 'error';
  code: string;
  message: string;
}

export interface RoomCreatedMessage {
  type: 'room_created';
  roomCode: string;
}

// === SERVER -> CLIENT (Controller specific) ===

export interface YouDiedMessage {
  type: 'you_died';
  killerName?: string;
  respawnIn: number;
}

export interface YouScoredMessage {
  type: 'you_scored';
  points: number;
  reason: 'asteroid' | 'kill';
}

// Union types for type safety
export type ClientMessage = 
  | JoinRoomMessage 
  | PlayerReadyMessage 
  | PlayerInputMessage 
  | LeaveRoomMessage
  | CreateRoomMessage 
  | StartGameMessage 
  | DisplayConnectMessage;

export type ServerMessage = 
  | RoomUpdateMessage 
  | GameStateMessage 
  | InputAckMessage 
  | ErrorMessage
  | RoomCreatedMessage 
  | YouDiedMessage 
  | YouScoredMessage;
```

---

## 6. Game Constants (packages/shared/src/constants.ts)

```typescript
export const GAME_CONFIG = {
  // World
  WORLD_WIDTH: 3840,           // 4K width for big screen
  WORLD_HEIGHT: 2160,          // 4K height
  
  // Timing
  TICK_RATE: 60,               // Server ticks per second
  BROADCAST_RATE: 20,          // State broadcasts per second
  
  // Ship
  SHIP_RADIUS: 30,
  SHIP_MAX_SPEED: 400,         // Units per second
  SHIP_ACCELERATION: 300,
  SHIP_ROTATION_SPEED: 4,      // Radians per second
  SHIP_DRAG: 0.98,             // Velocity multiplier per tick
  SHIP_HEALTH: 3,
  SHIP_RESPAWN_TIME: 5,        // Seconds
  SHIP_INVULN_TIME: 2,         // Seconds of invulnerability after spawn
  
  // Bullets
  BULLET_SPEED: 600,
  BULLET_LIFETIME: 1.5,        // Seconds
  BULLET_RADIUS: 5,
  FIRE_COOLDOWN: 0.25,         // Seconds between shots
  
  // Asteroids
  ASTEROID_SIZES: {
    large: { radius: 60, score: 20, speed: 50 },
    medium: { radius: 35, score: 50, speed: 80 },
    small: { radius: 18, score: 100, speed: 120 },
  },
  INITIAL_ASTEROIDS: 8,
  MAX_ASTEROIDS: 30,
  ASTEROID_SPAWN_INTERVAL: 10, // Seconds
  
  // Scoring
  KILL_SCORE: 200,
  
  // Room
  MAX_PLAYERS: 10,
  MIN_PLAYERS_TO_START: 2,
  COUNTDOWN_SECONDS: 5,
  GAME_DURATION: 180,          // 3 minutes
  
  // Colors (for players)
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
```

---

## 7. Server Implementation Details

### 7.1 GameServer.ts - Core Structure

```typescript
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { Room } from './Room';
import { ClientMessage, ServerMessage } from '@cosmic-chaos/shared';

interface Client {
  ws: WebSocket;
  id: string;
  roomCode: string | null;
  type: 'controller' | 'display';
}

export class GameServer {
  private wss: WebSocketServer;
  private rooms: Map<string, Room> = new Map();
  private clients: Map<WebSocket, Client> = new Map();

  constructor(port: number) {
    const server = createServer();
    this.wss = new WebSocketServer({ server });
    
    this.wss.on('connection', this.handleConnection.bind(this));
    
    server.listen(port, () => {
      console.log(`Game server running on port ${port}`);
    });
  }

  private handleConnection(ws: WebSocket) {
    const client: Client = {
      ws,
      id: generateId(),
      roomCode: null,
      type: 'controller', // Default, updated on first message
    };
    this.clients.set(ws, client);

    ws.on('message', (data) => this.handleMessage(client, data));
    ws.on('close', () => this.handleDisconnect(client));
  }

  private handleMessage(client: Client, data: Buffer) {
    const message: ClientMessage = JSON.parse(data.toString());
    
    switch (message.type) {
      case 'create_room':
        this.createRoom(client);
        break;
      case 'join_room':
        this.joinRoom(client, message.roomCode, message.playerName);
        break;
      case 'player_input':
        this.handleInput(client, message.input);
        break;
      // ... handle other message types
    }
  }

  private createRoom(client: Client): void {
    const code = generateRoomCode(); // 4 uppercase letters
    const room = new Room(code, (msg) => this.broadcastToRoom(code, msg));
    this.rooms.set(code, room);
    client.roomCode = code;
    client.type = 'display';
    
    this.send(client.ws, { type: 'room_created', roomCode: code });
  }

  private broadcastToRoom(code: string, message: ServerMessage): void {
    for (const [ws, client] of this.clients) {
      if (client.roomCode === code) {
        this.send(ws, message);
      }
    }
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }
}

// Utility functions
function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // Omit I, O to avoid confusion
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
```

### 7.2 GameLoop.ts - Fixed Timestep Loop

```typescript
import { GAME_CONFIG } from '@cosmic-chaos/shared';

export class GameLoop {
  private tickRate: number;
  private tickInterval: number;
  private lastTick: number = 0;
  private accumulator: number = 0;
  private tick: number = 0;
  private running: boolean = false;

  constructor(
    private onTick: (dt: number, tick: number) => void,
    private onBroadcast: () => void
  ) {
    this.tickRate = GAME_CONFIG.TICK_RATE;
    this.tickInterval = 1000 / this.tickRate;
  }

  start(): void {
    this.running = true;
    this.lastTick = performance.now();
    this.loop();
  }

  stop(): void {
    this.running = false;
  }

  private loop = (): void => {
    if (!this.running) return;

    const now = performance.now();
    const delta = now - this.lastTick;
    this.lastTick = now;
    this.accumulator += delta;

    // Fixed timestep updates
    while (this.accumulator >= this.tickInterval) {
      this.onTick(this.tickInterval / 1000, this.tick);
      this.tick++;
      this.accumulator -= this.tickInterval;

      // Broadcast at lower rate
      if (this.tick % (GAME_CONFIG.TICK_RATE / GAME_CONFIG.BROADCAST_RATE) === 0) {
        this.onBroadcast();
      }
    }

    setImmediate(this.loop);
  };
}
```

### 7.3 Physics.ts - Core Physics

```typescript
import { Vector2, Ship, Asteroid, Bullet, GAME_CONFIG } from '@cosmic-chaos/shared';

export class Physics {
  // Move entity with world wrapping
  static moveEntity(
    position: Vector2,
    velocity: Vector2,
    dt: number,
    worldSize: Vector2
  ): void {
    position.x += velocity.x * dt;
    position.y += velocity.y * dt;

    // Wrap around world edges
    if (position.x < 0) position.x += worldSize.x;
    if (position.x > worldSize.x) position.x -= worldSize.x;
    if (position.y < 0) position.y += worldSize.y;
    if (position.y > worldSize.y) position.y -= worldSize.y;
  }

  // Apply thrust to ship
  static applyThrust(ship: Ship, dt: number): void {
    if (ship.isThrusting) {
      const thrustX = Math.cos(ship.rotation) * GAME_CONFIG.SHIP_ACCELERATION * dt;
      const thrustY = Math.sin(ship.rotation) * GAME_CONFIG.SHIP_ACCELERATION * dt;
      
      ship.velocity.x += thrustX;
      ship.velocity.y += thrustY;

      // Clamp to max speed
      const speed = Math.sqrt(ship.velocity.x ** 2 + ship.velocity.y ** 2);
      if (speed > GAME_CONFIG.SHIP_MAX_SPEED) {
        ship.velocity.x = (ship.velocity.x / speed) * GAME_CONFIG.SHIP_MAX_SPEED;
        ship.velocity.y = (ship.velocity.y / speed) * GAME_CONFIG.SHIP_MAX_SPEED;
      }
    }

    // Apply drag
    ship.velocity.x *= GAME_CONFIG.SHIP_DRAG;
    ship.velocity.y *= GAME_CONFIG.SHIP_DRAG;
  }

  // Circle-circle collision
  static checkCollision(
    pos1: Vector2,
    radius1: number,
    pos2: Vector2,
    radius2: number,
    worldSize: Vector2
  ): boolean {
    // Check with wrapping (nearest distance considering world wrap)
    let dx = pos2.x - pos1.x;
    let dy = pos2.y - pos1.y;

    // Adjust for world wrapping
    if (Math.abs(dx) > worldSize.x / 2) {
      dx = dx > 0 ? dx - worldSize.x : dx + worldSize.x;
    }
    if (Math.abs(dy) > worldSize.y / 2) {
      dy = dy > 0 ? dy - worldSize.y : dy + worldSize.y;
    }

    const distSq = dx * dx + dy * dy;
    const radiusSum = radius1 + radius2;
    
    return distSq <= radiusSum * radiusSum;
  }

  // Split asteroid into smaller pieces
  static splitAsteroid(asteroid: Asteroid): Asteroid[] {
    const nextSize = asteroid.size === 'large' ? 'medium' : 'small';
    if (asteroid.size === 'small') return [];

    const config = GAME_CONFIG.ASTEROID_SIZES[nextSize];
    const pieces: Asteroid[] = [];

    for (let i = 0; i < 2; i++) {
      const angle = Math.random() * Math.PI * 2;
      pieces.push({
        id: generateId(),
        position: { ...asteroid.position },
        velocity: {
          x: Math.cos(angle) * config.speed,
          y: Math.sin(angle) * config.speed,
        },
        rotation: Math.random() * Math.PI * 2,
        angularVelocity: (Math.random() - 0.5) * 2,
        size: nextSize,
        radius: config.radius,
        variant: Math.floor(Math.random() * 4),
      });
    }

    return pieces;
  }
}
```

---

## 8. Display Client Implementation

### 8.1 GameRenderer.ts - Pixi.js Setup

```typescript
import * as PIXI from 'pixi.js';
import { GameState, Ship, Asteroid, Bullet, GAME_CONFIG } from '@cosmic-chaos/shared';
import { Interpolator } from './Interpolator';
import { ParticleSystem } from './ParticleSystem';

export class GameRenderer {
  private app: PIXI.Application;
  private gameContainer: PIXI.Container;
  private interpolator: Interpolator;
  private particles: ParticleSystem;
  
  private shipSprites: Map<string, PIXI.Container> = new Map();
  private asteroidSprites: Map<string, PIXI.Sprite> = new Map();
  private bulletSprites: Map<string, PIXI.Graphics> = new Map();

  async init(canvas: HTMLCanvasElement): Promise<void> {
    this.app = new PIXI.Application();
    await this.app.init({
      canvas,
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundColor: 0x0a0a12,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
    });

    this.gameContainer = new PIXI.Container();
    this.app.stage.addChild(this.gameContainer);

    // Scale to fit world on screen
    this.updateScale();
    window.addEventListener('resize', () => this.updateScale());

    this.interpolator = new Interpolator();
    this.particles = new ParticleSystem(this.gameContainer);

    // Start render loop
    this.app.ticker.add(() => this.render());
  }

  private updateScale(): void {
    const scaleX = window.innerWidth / GAME_CONFIG.WORLD_WIDTH;
    const scaleY = window.innerHeight / GAME_CONFIG.WORLD_HEIGHT;
    const scale = Math.min(scaleX, scaleY);
    
    this.gameContainer.scale.set(scale);
    this.gameContainer.position.set(
      (window.innerWidth - GAME_CONFIG.WORLD_WIDTH * scale) / 2,
      (window.innerHeight - GAME_CONFIG.WORLD_HEIGHT * scale) / 2
    );
  }

  updateState(state: GameState): void {
    this.interpolator.pushState(state);
  }

  private render(): void {
    const state = this.interpolator.getInterpolatedState();
    if (!state) return;

    this.renderShips(state.ships);
    this.renderAsteroids(state.asteroids);
    this.renderBullets(state.bullets);
    this.particles.update(this.app.ticker.deltaMS / 1000);
  }

  private renderShips(ships: Ship[]): void {
    const activeIds = new Set(ships.map(s => s.id));

    // Remove sprites for ships that no longer exist
    for (const [id, sprite] of this.shipSprites) {
      if (!activeIds.has(id)) {
        this.gameContainer.removeChild(sprite);
        this.shipSprites.delete(id);
      }
    }

    // Update/create sprites
    for (const ship of ships) {
      let sprite = this.shipSprites.get(ship.id);
      
      if (!sprite) {
        sprite = this.createShipSprite(ship);
        this.shipSprites.set(ship.id, sprite);
        this.gameContainer.addChild(sprite);
      }

      sprite.position.set(ship.position.x, ship.position.y);
      sprite.rotation = ship.rotation + Math.PI / 2; // Adjust for sprite orientation
      sprite.alpha = ship.isAlive ? 1 : 0.3;
      
      // Show thrust flame
      const flame = sprite.getChildByName('flame') as PIXI.Graphics;
      if (flame) {
        flame.visible = ship.isThrusting && ship.isAlive;
      }
    }
  }

  private createShipSprite(ship: Ship): PIXI.Container {
    const container = new PIXI.Container();
    
    // Ship body (triangle)
    const body = new PIXI.Graphics();
    body.fill({ color: ship.color });
    body.poly([
      { x: 0, y: -30 },    // Nose
      { x: -20, y: 20 },   // Left wing
      { x: 0, y: 10 },     // Tail indent
      { x: 20, y: 20 },    // Right wing
    ]);
    body.fill();
    container.addChild(body);

    // Thrust flame
    const flame = new PIXI.Graphics();
    flame.name = 'flame';
    flame.fill({ color: 0xff6600 });
    flame.poly([
      { x: -8, y: 15 },
      { x: 0, y: 40 },
      { x: 8, y: 15 },
    ]);
    flame.fill();
    flame.visible = false;
    container.addChild(flame);

    // Player name
    const nameText = new PIXI.Text({
      text: ship.name,
      style: {
        fontFamily: 'monospace',
        fontSize: 14,
        fill: 0xffffff,
      },
    });
    nameText.anchor.set(0.5, 0);
    nameText.position.set(0, 30);
    container.addChild(nameText);

    return container;
  }

  // Trigger explosion effect
  explodeAt(x: number, y: number, color: string, intensity: number = 1): void {
    this.particles.explode(x, y, color, intensity);
  }
}
```

### 8.2 Interpolator.ts - Smooth State Rendering

```typescript
import { GameState, Ship, Asteroid, Bullet } from '@cosmic-chaos/shared';

interface TimestampedState {
  state: GameState;
  receivedAt: number;
}

export class Interpolator {
  private stateBuffer: TimestampedState[] = [];
  private readonly BUFFER_SIZE = 3;
  private readonly INTERPOLATION_DELAY = 100; // ms behind latest state

  pushState(state: GameState): void {
    this.stateBuffer.push({
      state,
      receivedAt: performance.now(),
    });

    // Keep buffer size limited
    while (this.stateBuffer.length > this.BUFFER_SIZE) {
      this.stateBuffer.shift();
    }
  }

  getInterpolatedState(): GameState | null {
    if (this.stateBuffer.length < 2) {
      return this.stateBuffer[0]?.state || null;
    }

    const renderTime = performance.now() - this.INTERPOLATION_DELAY;

    // Find states to interpolate between
    let before: TimestampedState | null = null;
    let after: TimestampedState | null = null;

    for (let i = 0; i < this.stateBuffer.length - 1; i++) {
      if (
        this.stateBuffer[i].receivedAt <= renderTime &&
        this.stateBuffer[i + 1].receivedAt >= renderTime
      ) {
        before = this.stateBuffer[i];
        after = this.stateBuffer[i + 1];
        break;
      }
    }

    if (!before || !after) {
      // Return latest if we can't interpolate
      return this.stateBuffer[this.stateBuffer.length - 1].state;
    }

    const t = (renderTime - before.receivedAt) / (after.receivedAt - before.receivedAt);
    return this.interpolateStates(before.state, after.state, t);
  }

  private interpolateStates(a: GameState, b: GameState, t: number): GameState {
    return {
      ...b,
      ships: this.interpolateEntities(a.ships, b.ships, t),
      asteroids: this.interpolateEntities(a.asteroids, b.asteroids, t),
      bullets: this.interpolateEntities(a.bullets, b.bullets, t),
    };
  }

  private interpolateEntities<T extends { id: string; position: { x: number; y: number }; rotation: number }>(
    a: T[],
    b: T[],
    t: number
  ): T[] {
    return b.map((entityB) => {
      const entityA = a.find((e) => e.id === entityB.id);
      if (!entityA) return entityB;

      return {
        ...entityB,
        position: {
          x: this.lerp(entityA.position.x, entityB.position.x, t),
          y: this.lerp(entityA.position.y, entityB.position.y, t),
        },
        rotation: this.lerpAngle(entityA.rotation, entityB.rotation, t),
      };
    });
  }

  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  private lerpAngle(a: number, b: number, t: number): number {
    let diff = b - a;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    return a + diff * t;
  }
}
```

---

## 9. Controller Client Implementation

### 9.1 Controller.tsx - Main Control Surface

```tsx
import React, { useCallback, useRef, useEffect } from 'react';
import { VirtualJoystick } from './VirtualJoystick';
import { FireButton } from './FireButton';
import { useConnection } from '../hooks/useConnection';
import { useHaptics } from '../hooks/useHaptics';
import { PlayerInput } from '@cosmic-chaos/shared';

interface ControllerProps {
  roomCode: string;
  playerName: string;
}

export const Controller: React.FC<ControllerProps> = ({ roomCode, playerName }) => {
  const { send, shipState, isConnected } = useConnection(roomCode, playerName);
  const { vibrate } = useHaptics();
  
  const inputRef = useRef<Partial<PlayerInput>>({
    rotation: 0,
    thrust: false,
    fire: false,
  });
  const sequenceRef = useRef(0);
  const lastSendRef = useRef(0);

  // Send input at 30Hz
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      if (now - lastSendRef.current >= 33) { // ~30Hz
        send({
          type: 'player_input',
          input: {
            ...inputRef.current,
            sequenceNumber: sequenceRef.current++,
            timestamp: now,
          } as PlayerInput,
        });
        lastSendRef.current = now;
      }
    }, 16);

    return () => clearInterval(interval);
  }, [send]);

  const handleJoystick = useCallback((rotation: number, thrust: boolean) => {
    inputRef.current.rotation = rotation;
    inputRef.current.thrust = thrust;
  }, []);

  const handleFire = useCallback((firing: boolean) => {
    inputRef.current.fire = firing;
    if (firing) {
      vibrate(50); // Short haptic on fire
    }
  }, [vibrate]);

  if (!shipState?.isAlive) {
    return <DeadScreen respawnIn={shipState?.respawnTimer || 0} />;
  }

  return (
    <div className="controller-container">
      {/* Left side: Joystick */}
      <div className="joystick-area">
        <VirtualJoystick onChange={handleJoystick} />
      </div>

      {/* Right side: Fire button */}
      <div className="fire-area">
        <FireButton onStateChange={handleFire} />
      </div>

      {/* HUD */}
      <div className="hud">
        <div className="health">
          {Array.from({ length: shipState?.health || 0 }).map((_, i) => (
            <span key={i} className="health-pip">♥</span>
          ))}
        </div>
        <div className="score">{shipState?.score || 0}</div>
      </div>
    </div>
  );
};
```

### 9.2 VirtualJoystick.tsx

```tsx
import React, { useRef, useCallback, useEffect } from 'react';

interface VirtualJoystickProps {
  onChange: (rotation: number, thrust: boolean) => void;
  size?: number;
}

export const VirtualJoystick: React.FC<VirtualJoystickProps> = ({ 
  onChange,
  size = 150 
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const touchIdRef = useRef<number | null>(null);
  const centerRef = useRef({ x: 0, y: 0 });

  const handleStart = useCallback((clientX: number, clientY: number, touchId?: number) => {
    if (touchIdRef.current !== null) return; // Already tracking a touch
    
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    touchIdRef.current = touchId ?? -1;
    centerRef.current = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  }, []);

  const handleMove = useCallback((clientX: number, clientY: number) => {
    if (touchIdRef.current === null) return;

    const dx = clientX - centerRef.current.x;
    const dy = clientY - centerRef.current.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const maxDistance = size / 2;

    // Calculate rotation (-1 to 1 based on horizontal position)
    const clampedDistance = Math.min(distance, maxDistance);
    const normalizedX = dx / maxDistance;
    const rotation = Math.max(-1, Math.min(1, normalizedX));

    // Thrust if pushing up (negative Y)
    const thrust = dy < -20;

    // Update knob position
    if (knobRef.current) {
      const angle = Math.atan2(dy, dx);
      const knobX = Math.cos(angle) * clampedDistance;
      const knobY = Math.sin(angle) * clampedDistance;
      knobRef.current.style.transform = `translate(${knobX}px, ${knobY}px)`;
    }

    onChange(rotation, thrust);
  }, [onChange, size]);

  const handleEnd = useCallback(() => {
    touchIdRef.current = null;
    if (knobRef.current) {
      knobRef.current.style.transform = 'translate(0, 0)';
    }
    onChange(0, false);
  }, [onChange]);

  // Touch event handlers
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const touch = e.changedTouches[0];
    handleStart(touch.clientX, touch.clientY, touch.identifier);
  }, [handleStart]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === touchIdRef.current) {
        handleMove(touch.clientX, touch.clientY);
        break;
      }
    }
  }, [handleMove]);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === touchIdRef.current) {
        handleEnd();
        break;
      }
    }
  }, [handleEnd]);

  return (
    <div
      ref={containerRef}
      className="joystick-base"
      style={{ width: size, height: size }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      <div ref={knobRef} className="joystick-knob" />
      <div className="joystick-indicator thrust-zone">↑ THRUST</div>
    </div>
  );
};
```

### 9.3 FireButton.tsx

```tsx
import React, { useCallback, useRef } from 'react';

interface FireButtonProps {
  onStateChange: (firing: boolean) => void;
}

export const FireButton: React.FC<FireButtonProps> = ({ onStateChange }) => {
  const touchIdRef = useRef<number | null>(null);

  const handleStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    if (touchIdRef.current === null) {
      touchIdRef.current = e.changedTouches[0].identifier;
      onStateChange(true);
    }
  }, [onStateChange]);

  const handleEnd = useCallback((e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === touchIdRef.current) {
        touchIdRef.current = null;
        onStateChange(false);
        break;
      }
    }
  }, [onStateChange]);

  return (
    <button
      className="fire-button"
      onTouchStart={handleStart}
      onTouchEnd={handleEnd}
      onTouchCancel={handleEnd}
    >
      <span className="fire-icon">🔥</span>
      <span className="fire-text">FIRE</span>
    </button>
  );
};
```

---

## 10. Visual Design Direction

### 10.1 Aesthetic: "Neon Arcade Brutalism"
- Deep space black background (#0a0a12)
- High-contrast neon colors for ships
- CRT-style scanline overlay (subtle)
- Chunky, angular ship designs
- Particle explosions with color trails
- Minimal UI, maximum game visibility

### 10.2 Display Screen Elements
- Game takes full screen
- QR code + room code in corner (semi-transparent, doesn't obstruct)
- Scrolling scoreboard on edge
- Big announcement text for kills ("PLAYER_X DESTROYED PLAYER_Y")

### 10.3 Controller Screen Elements
- Full black background to save battery
- Joystick: circular area, neon ring, darker knob
- Fire button: Large, pulsing when ready, muted when on cooldown
- Health/score: Minimal HUD at top
- Haptic feedback on: fire, take damage, die, score

### 10.4 Fonts
- Display: "Space Mono" or "VT323" for retro terminal feel
- Controller: System font for performance

---

## 11. Latency Mitigation Strategies

### 11.1 Input Handling
```
Controller sends input → Server receives → Server processes → Server broadcasts
                                                                    ↓
                                          Display interpolates ← Display receives
```

### 11.2 Techniques Implemented

| Technique | Where | Purpose |
|-----------|-------|---------|
| Input batching | Controller | Send at 30Hz, not per-frame |
| Sequence numbers | Messages | Track input acknowledgment |
| State interpolation | Display | Smooth between server updates |
| Client-side prediction | Display | Immediate ship response to own input |
| Dead reckoning | Display | Predict positions between updates |
| Lag compensation | Server | Rewind for hit detection |

### 11.3 Expected Latency Breakdown
- WiFi round-trip: 10-30ms
- Server processing: 1-2ms
- Display interpolation buffer: 50-100ms (configurable)
- **Total perceived latency: 60-130ms** (acceptable for this game type)

---

## 12. Deployment Configuration

### 12.1 docker-compose.yml

```yaml
version: '3.8'
services:
  server:
    build:
      context: .
      dockerfile: Dockerfile.server
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    restart: unless-stopped

  display:
    build:
      context: .
      dockerfile: Dockerfile.display
    ports:
      - "8080:80"
    depends_on:
      - server

  controller:
    build:
      context: .
      dockerfile: Dockerfile.controller
    ports:
      - "8081:80"
    depends_on:
      - server
```

### 12.2 Network Setup for Venue
1. Dedicated WiFi network (or use existing)
2. Static IP for game server
3. Router QoS priority for WebSocket traffic
4. Display URL: `http://[SERVER_IP]:8080`
5. Controller URL: `http://[SERVER_IP]:8081` (or custom domain)

### 12.3 Raspberry Pi Deployment
- Raspberry Pi 4 (4GB+ recommended)
- Ubuntu Server 22.04 or Raspberry Pi OS Lite
- Node.js 18+
- Chromium in kiosk mode for display
- Auto-start on boot via systemd

---

## 13. Implementation Phases

### Phase 1: Core Infrastructure (Day 1-2)
- [ ] Monorepo setup with Turborepo
- [ ] Shared types package
- [ ] Basic WebSocket server with room management
- [ ] Display client shell with Pixi.js
- [ ] Controller client shell with joystick

### Phase 2: Game Mechanics (Day 3-4)
- [ ] Ship movement and physics
- [ ] Asteroid spawning and splitting
- [ ] Bullet firing and collision
- [ ] Scoring system
- [ ] Death and respawn

### Phase 3: Networking (Day 5)
- [ ] State broadcast optimization
- [ ] Interpolation on display
- [ ] Input acknowledgment
- [ ] Reconnection handling

### Phase 4: Polish (Day 6-7)
- [ ] Particle effects
- [ ] Sound effects (optional - display only)
- [ ] Controller haptics
- [ ] QR code generation
- [ ] Countdown and game over screens

### Phase 5: Deployment (Day 8)
- [ ] Docker configuration
- [ ] Raspberry Pi setup script
- [ ] Performance testing with 10 clients
- [ ] Latency measurement and tuning

---

## 14. Testing Checklist

### Functional
- [ ] Single player can join and control ship
- [ ] Multiple players (2, 5, 10) can play simultaneously
- [ ] Asteroids spawn and split correctly
- [ ] Bullets destroy asteroids and ships
- [ ] Score updates correctly
- [ ] Respawn works after death
- [ ] Game ends after timer

### Network
- [ ] Controller reconnects after WiFi drop
- [ ] Display handles server restart gracefully
- [ ] Latency stays under 150ms with 10 players
- [ ] No desync between display and server state

### Edge Cases
- [ ] Player joins mid-game
- [ ] Player leaves mid-game
- [ ] All players die simultaneously
- [ ] Maximum asteroids on screen
- [ ] Rapid fire button mashing

---

## 15. Future Enhancements (Out of Scope for MVP)

- Power-ups (shields, rapid fire, spread shot)
- Team modes
- Custom ship skins
- Persistent leaderboards
- Spectator mode on phones
- Voice chat integration
- Tournament bracket system

---

## Handoff Notes for Claude Code

1. **Start with Phase 1** - Get the basic infrastructure working first. Don't worry about polish until core mechanics work.

2. **Test early with real phones** - Emulators don't capture the true touch experience. Get two phones on the network ASAP.

3. **The interpolation is critical** - Spend time tuning the interpolation buffer. Too low = jitter, too high = unresponsive. Start at 100ms and adjust.

4. **Watch memory on the server** - Clean up dead rooms, don't leak entity references, watch the state broadcast payload size.

5. **Mobile Safari quirks** - Touch event handling needs the `{ passive: false }` option to prevent scroll. Test on iOS early.

6. **Shawn's preferences** - He likes irreverent humor, so feel free to add fun kill messages ("X was yeeted into the void by Y"). Don't overthink it.

Good luck! 🚀
